import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from core import db
from routes.auth import get_current_user

router = APIRouter()

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
PRICE_MONTHLY = os.environ.get("STRIPE_PRICE_MONTHLY")
PRICE_YEARLY = os.environ.get("STRIPE_PRICE_YEARLY")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")


@router.post("/billing/create-checkout-session/{plan}")
async def create_checkout_session(plan: str, user=Depends(get_current_user)):
    if plan not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Plano inválido")

    price_id = PRICE_MONTHLY if plan == "monthly" else PRICE_YEARLY

    if not price_id:
        raise HTTPException(status_code=500, detail="Preço Stripe não configurado")

    customer_id = user.get("stripe_customer_id")

    if not customer_id:
        customer = stripe.Customer.create(
            email=user["email"],
            metadata={"user_id": user["id"]}
        )

        customer_id = customer.id

        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"stripe_customer_id": customer_id}}
        )

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[
            {
                "price": price_id,
                "quantity": 1
            }
        ],
        payment_method_collection="always",
        subscription_data={
            "trial_period_days": 30,
            "metadata": {
                "user_id": user["id"],
                "plan": plan
            }
        },
        success_url=f"{FRONTEND_URL}/billing-success",
        cancel_url=f"{FRONTEND_URL}/pricing"
    )

    return {"url": session.url}


@router.post("/billing/create-portal-session")
async def create_portal_session(user=Depends(get_current_user)):
    customer_id = user.get("stripe_customer_id")

    if not customer_id:
        raise HTTPException(status_code=400, detail="Cliente Stripe ainda não existe")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{FRONTEND_URL}/settings"
    )

    return {"url": session.url}

@router.get("/billing/subscription-status")
async def subscription_status(user=Depends(get_current_user)):
    return {
        "subscription_status": user.get("subscription_status", "none"),
        "subscription_plan": user.get("subscription_plan"),
        "trial_ends_at": user.get("trial_ends_at"),
        "current_period_end": user.get("current_period_end"),
        "stripe_customer_id": user.get("stripe_customer_id"),
        "stripe_subscription_id": user.get("stripe_subscription_id"),
    }

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not WEBHOOK_SECRET:
        # Fail closed, not open: without a configured secret there is no way
        # to verify this request actually came from Stripe — trusting an
        # unsigned payload here would let anyone POST a fake
        # "subscription.updated" event and grant themselves Pro for free.
        raise HTTPException(status_code=500, detail="Webhook não configurado")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook inválido")

    if event["type"] in [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted"
    ]:
        subscription = event["data"]["object"]

        customer_id = subscription.get("customer")
        status = subscription.get("status")
        subscription_id = subscription.get("id")
        trial_end = subscription.get("trial_end")
        current_period_end = subscription.get("current_period_end")
        plan = subscription.get("metadata", {}).get("plan")

        await db.users.update_one(
            {"stripe_customer_id": customer_id},
            {
                "$set": {
                    "subscription_status": status,
                    "subscription_plan": plan,
                    "stripe_subscription_id": subscription_id,
                    "trial_ends_at": trial_end,
                    "current_period_end": current_period_end,
                }
            }
        )

    return {"ok": True}
import os
import time
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from core import db, logger
from routes.auth import get_current_user
from referral_utils import grant_referrer_reward_if_needed

router = APIRouter()

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
PRICE_MONTHLY = os.environ.get("STRIPE_PRICE_MONTHLY")
PRICE_YEARLY = os.environ.get("STRIPE_PRICE_YEARLY")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")

# Oferta de Fundadores: nº de vagas e cupão/código promocional do Stripe cujos
# resgates alimentam o contador público "X/100" na landing. Se
# STRIPE_FOUNDER_PROMO_ID não estiver definido, o contador fica sem número
# (a landing mostra só a oferta — nunca um número inventado).
FOUNDER_PROMO_ID = os.environ.get("STRIPE_FOUNDER_PROMO_ID")
FOUNDER_SEATS = int(os.environ.get("STRIPE_FOUNDER_SEATS", "100") or "100")
_founder_cache = {"ts": 0.0, "data": None}

# Multi-moeda (18 jul 2026). O utilizador escolhe a moeda na p\u00e1gina de pre\u00e7os.
# Cada moeda precisa dos seus pr\u00f3prios Price IDs no Stripe; enquanto n\u00e3o
# estiverem configurados (env vars ..._CHF/_USD/_BRL), recuamos para EUR para
# n\u00e3o partir o checkout.
def _price_id_for(plan: str, currency: str) -> str | None:
    currency = (currency or "eur").lower()
    table = {
        "eur": {"monthly": PRICE_MONTHLY, "yearly": PRICE_YEARLY},
        "chf": {"monthly": os.environ.get("STRIPE_PRICE_MONTHLY_CHF"), "yearly": os.environ.get("STRIPE_PRICE_YEARLY_CHF")},
        "usd": {"monthly": os.environ.get("STRIPE_PRICE_MONTHLY_USD"), "yearly": os.environ.get("STRIPE_PRICE_YEARLY_USD")},
        "brl": {"monthly": os.environ.get("STRIPE_PRICE_MONTHLY_BRL"), "yearly": os.environ.get("STRIPE_PRICE_YEARLY_BRL")},
    }
    chosen = table.get(currency, table["eur"])
    return chosen.get(plan) or table["eur"].get(plan)


@router.post("/billing/create-checkout-session/{plan}")
async def create_checkout_session(plan: str, currency: str = "eur", user=Depends(get_current_user)):
    if plan not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Plano inválido")

    price_id = _price_id_for(plan, currency)

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

    # Programa de referral (14 jul 2026) — quem se registou com um código de
    # convite ganha 15 dias extra de trial (30 -> 45), uma única vez. Marcado
    # logo aqui (não à espera do webhook) porque é aqui que o
    # trial_period_days fica de facto definido na subscrição Stripe.
    trial_days = 30
    if user.get("referred_by") and not user.get("referral_trial_bonus_applied"):
        trial_days = 45
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"referral_trial_bonus_applied": True}}
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
        # Ativa o campo de código promocional no Checkout — necessário para a
        # oferta de "Fundadores" (cupão com desconto vitalício, nº de lugares
        # limitado, gerido no Stripe). Sem código introduzido não muda nada.
        allow_promotion_codes=True,
        subscription_data={
            "trial_period_days": trial_days,
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

        # Programa de referral (14 jul 2026) — lê o estado ANTERIOR antes de
        # sobrescrever, para detetar a transição trialing -> active (primeiro
        # pagamento feito com sucesso). É só nesse momento que um convite
        # passa a "válido" — nunca no registo, para não poder ser gamed com
        # contas que nunca chegam a pagar.
        existing_user = await db.users.find_one({"stripe_customer_id": customer_id}, {"_id": 0, "id": 1, "subscription_status": 1})
        prev_status = existing_user.get("subscription_status") if existing_user else None

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

        # Fundadores (X/100): marca o utilizador como fundador se a subscrição
        # traz o cupão/código de fundador aplicado. Só marca True, nunca desmarca
        # (um evento posterior pode não trazer o desconto expandido).
        try:
            if _subscription_is_founder(subscription):
                await db.users.update_one(
                    {"stripe_customer_id": customer_id},
                    {"$set": {"is_founder": True}},
                )
        except Exception as e:
            logger.warning(f"founder: falha a marcar fundador ({customer_id}): {e}")

        if existing_user and prev_status != "active" and status == "active":
            referral = await db.referrals.find_one({
                "referred_user_id": existing_user["id"],
                "status": "pending",
            })
            if referral:
                await db.referrals.update_one(
                    {"id": referral["id"]},
                    {"$set": {"status": "valid", "valid_at": datetime.now(timezone.utc).isoformat()}},
                )
                try:
                    await grant_referrer_reward_if_needed(referral["referrer_id"])
                except Exception as e:
                    logger.error(f"referral: falha ao conceder recompensa ao referrer {referral['referrer_id']}: {e}")

    return {"ok": True}

def _subscription_is_founder(sub) -> bool:
    # True se a subscrição traz o cupão/código promocional de fundador
    # aplicado (FOUNDER_PROMO_ID pode ser o id do cupão ou um promo_...).
    # Parsing defensivo: o objeto da subscrição pode trazer o desconto em
    # "discount" (single, legado) ou "discounts" (lista).
    if not FOUNDER_PROMO_ID:
        return False
    candidates = []
    d = sub.get("discount")
    if isinstance(d, dict):
        candidates.append(d)
    dl = sub.get("discounts")
    if isinstance(dl, list):
        candidates.extend(x for x in dl if isinstance(x, dict))
    for disc in candidates:
        coupon = disc.get("coupon")
        cid = coupon.get("id") if isinstance(coupon, dict) else coupon
        pc = disc.get("promotion_code")
        pcid = pc.get("id") if isinstance(pc, dict) else pc
        if FOUNDER_PROMO_ID in (cid, pcid):
            return True
    return False


@router.get("/billing/founder-status")
async def founder_status():
    # Público (sem auth): estado das vagas de fundador para a landing.
    #   confirmados = fundadores com subscrição "active" (já pagaram) -> ocupam vaga
    #   em_teste    = fundadores em "trialing" (provisorios, ainda podem confirmar/desistir)
    #   livres      = total - confirmados - em_teste (verde na barra)
    # Cache 60s para não bater na base de dados a cada visita.
    now = time.time()
    cached = _founder_cache["data"]
    if cached is not None and (now - _founder_cache["ts"]) < 60:
        return cached

    total = FOUNDER_SEATS
    try:
        confirmados = await db.users.count_documents({"is_founder": True, "subscription_status": "active"})
        em_teste = await db.users.count_documents({"is_founder": True, "subscription_status": "trialing"})
    except Exception as e:
        logger.warning(f"founder-status: falha a contar fundadores: {e}")
        confirmados = 0
        em_teste = 0

    livres = max(0, total - confirmados - em_teste)
    data = {"total": total, "confirmados": confirmados, "em_teste": em_teste, "livres": livres}
    _founder_cache["ts"] = now
    _founder_cache["data"] = data
    return data

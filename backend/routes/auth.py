"""Auth + email verification + password reset endpoints."""
import asyncio
import hashlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta

import stripe
from fastapi import APIRouter, HTTPException, Response, Request, Depends

from core import (
    db, hash_password, verify_password, create_access_token, get_current_user,
    APP_URL, check_rate_limit, logger, delete_all_user_data, write_auth_audit,
)
from email_utils import send_email, email_layout, _log_email_task_result
from models import (
    UserRegister, UserLogin, ForgotPasswordBody, ResetPasswordBody, TokenBody,
    ResendVerificationBody, DeleteAccountBody,
)

router = APIRouter()


@router.post("/auth/register")
async def register(payload: UserRegister, request: Request, response: Response):
    check_rate_limit(request, "register", max_attempts=8, window_seconds=3600)
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    verify_token = secrets.token_urlsafe(32)
    verify_hash = hashlib.sha256(verify_token.encode()).hexdigest()
    verify_expires = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name or email.split("@")[0],
        "password_hash": hash_password(payload.password),
        "email_verified": False,
        "verify_token_hash": verify_hash,
        "verify_token_expires": verify_expires,
        "last_verification_sent_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "plan": "free",
    }
    await db.users.insert_one(doc)

    verify_url = f"{APP_URL}/verify-email/{verify_token}"
    html = email_layout(
        title="Confirm your email",
        body_html=f"Hi {doc['name']},<br><br>Welcome to Wallet76! Click the button below to confirm your email address. The link expires in 48 hours.",
        cta_label="Confirm email",
        cta_url=verify_url,
    )
    asyncio.create_task(send_email(email, "Confirm your Wallet76 email", html)).add_done_callback(_log_email_task_result)

    # Do NOT auto-login. User must verify email before signing in.
    return {"ok": True, "email": email, "email_verified": False, "verification_sent": True}


@router.post("/auth/login")
async def login(payload: UserLogin, request: Request, response: Response):
    check_rate_limit(request, "login", max_attempts=10, window_seconds=300)
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        asyncio.create_task(write_auth_audit("login_failed", request, email=email))
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("email_verified"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_not_verified",
                "email": email,
                "message": "Please verify your email before signing in. Check your inbox for the confirmation link.",
            },
        )
    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    asyncio.create_task(write_auth_audit("login_success", request, email=email, user_id=user["id"]))
    return {"id": user["id"], "email": email, "name": user.get("name"), "token": token}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    full = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "password_hash": 0, "verify_token_hash": 0, "reset_token_hash": 0},
    ) or user
    # Garantir que plan está sempre presente
    if "plan" not in full:
        full["plan"] = "free"
    # Considerar pro se subscrição ativa
    sub_status = full.get("subscription_status", "none")
    if sub_status in ("active", "trialing"):
        full["plan"] = "pro"
    return full


@router.delete("/account")
async def delete_account(payload: DeleteAccountBody, response: Response, user=Depends(get_current_user)):
    """Self-service account deletion (GDPR right to erasure — the landing
    page promises this; until this endpoint existed, the only way to delete
    a user's data was an admin manually running the admin-only delete
    route). Requires the current password as confirmation since this is
    irreversible and can't be undone by support.

    Cancels any active Stripe subscription first (best-effort — a Stripe
    hiccup shouldn't block the user from deleting their own data), then
    removes every collection of the user's data via the same shared helper
    the admin delete-user route uses, so both stay in sync."""
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(payload.password, full.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect password")

    sub_id = full.get("stripe_subscription_id")
    if sub_id:
        try:
            stripe.Subscription.delete(sub_id)
        except Exception as e:
            logger.warning(f"Failed to cancel Stripe subscription {sub_id} during account deletion: {e}")

    await delete_all_user_data(user["id"])
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordBody, request: Request):
    """Always returns 200 to avoid enumeration. If user exists, sends reset email."""
    check_rate_limit(request, "forgot-password", max_attempts=6, window_seconds=3600)
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"reset_token_hash": token_hash, "reset_token_expires": expires}},
        )
        reset_url = f"{APP_URL}/reset-password/{token}"
        html = email_layout(
            title="Reset your password",
            body_html=f"Hi {user.get('name') or email},<br><br>We received a request to reset your Wallet76 password. The link below expires in 1 hour.",
            cta_label="Reset password",
            cta_url=reset_url,
        )
        asyncio.create_task(send_email(email, "Reset your Wallet76 password", html)).add_done_callback(_log_email_task_result)
    return {"ok": True}


@router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordBody, request: Request):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    user = await db.users.find_one({"reset_token_hash": token_hash})
    if not user:
        raise HTTPException(400, "Invalid or expired token")
    expires = user.get("reset_token_expires")
    try:
        if not expires or datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            raise HTTPException(400, "Token expired")
    except (TypeError, ValueError):
        raise HTTPException(400, "Token expired")
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"password_hash": hash_password(payload.new_password)},
            "$unset": {"reset_token_hash": "", "reset_token_expires": ""},
        },
    )
    asyncio.create_task(write_auth_audit("password_reset", request, email=user.get("email", ""), user_id=user["id"]))
    return {"ok": True}


@router.post("/auth/verify-email")
async def verify_email(payload: TokenBody):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    user = await db.users.find_one({"verify_token_hash": token_hash})
    if not user:
        raise HTTPException(400, "Invalid or expired token")
    expires = user.get("verify_token_expires")
    try:
        if not expires or datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            raise HTTPException(400, "Token expired")
    except (TypeError, ValueError):
        raise HTTPException(400, "Token expired")
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"email_verified": True},
            "$unset": {"verify_token_hash": "", "verify_token_expires": ""},
        },
    )
    return {"ok": True}


@router.post("/auth/resend-verification")
async def resend_verification(payload: ResendVerificationBody):
    """Public endpoint. Rate-limited 60s/email. Always returns 200 to avoid email enumeration."""
    email = payload.email.lower().strip()
    me_doc = await db.users.find_one({"email": email})
    if not me_doc or me_doc.get("email_verified"):
        return {"ok": True}
    # 60-second cooldown per email
    last = me_doc.get("last_verification_sent_at")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if (datetime.now(timezone.utc) - last_dt).total_seconds() < 60:
                return {"ok": True, "cooldown": True}
        except (TypeError, ValueError):
            pass
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    await db.users.update_one(
        {"id": me_doc["id"]},
        {"$set": {
            "verify_token_hash": token_hash,
            "verify_token_expires": expires,
            "last_verification_sent_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    verify_url = f"{APP_URL}/verify-email/{token}"
    html = email_layout(
        title="Confirm your email",
        body_html=(
            f"Hi {me_doc.get('name') or email},<br><br>"
            "Please verify your Wallet76 email address:<br><br>"
            f'<a href="{verify_url}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a>'
            "<br><br>Link expires in 48 hours."
        ),
    )
    await send_email(email, "Confirm your Wallet76 email", html)
    return {"ok": True}

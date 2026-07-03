"""Shared core: config, db, helpers, auth dependency, cache."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import bcrypt
import certifi
import jwt
import resend
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient

# --- Config ---
mongo_url = os.environ["MONGO_URL"]
# tlsCAFile=certifi.where(): pin the CA bundle explicitly instead of relying
# on whatever root certs the host OS happens to ship. Render's base image
# has caused "SSL: TLSV1_ALERT_INTERNAL_ERROR" handshake failures against
# Atlas when its system CA bundle drifts out of sync with what Atlas's TLS
# stack expects — using certifi's bundle (updated independently of the OS)
# avoids that class of failure.
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "onboarding@resend.dev")
APP_URL = os.environ.get("APP_URL") or os.environ.get("FRONTEND_URL", "")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

RP_ID = os.environ.get("WEBAUTHN_RP_ID", "")
RP_NAME = "Wallet76"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wallet76")


# --- Password & JWT helpers ---
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user

# Single source of truth for "who is an admin" — route files should import
# `require_admin` (a dependency) rather than re-checking `ADMIN_EMAILS`
# manually, so a newly-added admin route can't accidentally ship unguarded.
ADMIN_EMAILS = {"entredonos@gmail.com"}


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


async def require_active_subscription(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "admin":
        return user

    allowed_statuses = ["trialing", "active"]
    subscription_status = user.get("subscription_status", "none")

    if subscription_status not in allowed_statuses:
        raise HTTPException(
            status_code=402,
            detail="Subscription required"
        )

    return user


def is_pro_user(user: dict) -> bool:
    """True if user has an active/trialing subscription or is admin."""
    if user.get("role") == "admin":
        return True
    return user.get("subscription_status") in ("active", "trialing")


# Every Mongo collection that stores per-user data, keyed by `user_id`.
# Shared by both the admin delete-user route (feedback.py) and the
# self-service account-deletion route (auth.py) so they can never drift
# apart — a prior version of this list (only in the admin route, inline)
# used wrong collection names for three of these and silently left orphaned
# data behind on every deletion, since each collection was wrapped in its
# own swallowed try/except.
USER_DATA_COLLECTIONS = [
    "transactions", "wallets", "snapshots", "alerts", "watchlists",
    "watchlist_groups", "feedback", "user_prefs", "allocation_prefs",
    "share_links", "broker_connections", "audit_logs", "user_security",
    "user_keys",
]


async def delete_all_user_data(user_id: str) -> None:
    """Deletes every per-user collection, then the user document itself."""
    for col in USER_DATA_COLLECTIONS:
        try:
            await getattr(db, col).delete_many({"user_id": user_id})
        except Exception as e:
            logger.error(f"Failed to clear {col} for user {user_id}: {e}")
    await db.users.delete_one({"id": user_id})

# --- Simple in-memory cache ---
_cache: dict = {}


def cache_get(key: str, ttl: int):
    entry = _cache.get(key)
    if not entry:
        return None
    ts, data = entry
    if (datetime.now(timezone.utc) - ts).total_seconds() < ttl:
        return data
    return None


def cache_set(key: str, data) -> None:
    _cache[key] = (datetime.now(timezone.utc), data)


def cache_clear_prefix(prefix: str) -> int:
    """Remove todas as entradas cuja chave começa por `prefix`. Usado quando
    transações mudam (criar/editar/apagar/importar/reset) para invalidar de
    imediato o cache de /history (history_all: 1h, history_intraday: 15min)
    — sem isto, o gráfico da Dashboard continua a mostrar dados de ANTES da
    mudança até o TTL expirar (ex.: depois de um reset de ativos de teste,
    as gamas testadas nos 15 minutos anteriores ficavam presas ao resultado
    antigo, mesmo com os dados novos já na DB)."""
    keys = [k for k in _cache if k.startswith(prefix)]
    for k in keys:
        del _cache[k]
    return len(keys)


# Aliases kept for backwards compat with existing route code
_cache_get = cache_get
_cache_set = cache_set
_cache_clear_prefix = cache_clear_prefix


# --- Simple in-memory rate limiter (per-process) ---
# Render's free tier runs a single instance, so an in-memory counter is
# enough to stop casual brute-force/credential-stuffing/registration-spam
# without adding a new dependency (Redis, slowapi, etc). It resets on
# restart/redeploy — that just means limits reset too, not a security hole,
# since a redeploy is a rare, deliberate event, not something an attacker
# controls.
_rate_limit_hits: dict = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request, bucket: str, max_attempts: int, window_seconds: int) -> None:
    """Raise 429 if this (bucket, client IP) pair has hit `max_attempts`
    within the last `window_seconds`. Call at the top of any endpoint that
    should be brute-force-resistant (login, register, forgot-password)."""
    key = f"{bucket}:{_client_ip(request)}"
    now = datetime.now(timezone.utc).timestamp()
    hits = [t for t in _rate_limit_hits.get(key, []) if now - t < window_seconds]
    if len(hits) >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait a bit before trying again.",
        )
    hits.append(now)
    _rate_limit_hits[key] = hits


# --- WebAuthn helpers (used by security routes) ---
import base64


def b64url_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def detect_rp_id(req: Request) -> str:
    if RP_ID:
        return RP_ID
    host = req.headers.get("host", "").split(":")[0]
    return host or "localhost"


def origin_from_req(req: Request) -> str:
    """Return the expected WebAuthn origin derived from the incoming request."""
    host = req.headers.get("host", "localhost")
    # Strip port for comparison; browsers include it in origin
    scheme = "https" if req.headers.get("x-forwarded-proto") == "https" else "http"
    return f"{scheme}://{host}"

"""Shared core: config, db, helpers, auth dependency, cache."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import bcrypt
import jwt
import resend
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient

# --- Config ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
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

"""Shared core: config, db, helpers, auth dependency, cache."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import bcrypt
import certifi
import jwt
import resend
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
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

# Domínio do cookie de sessão (9 jul 2026) — sem isto, o cookie "access_token"
# fica preso ao host exato que respondeu ao /auth/login (host-only cookie,
# sem atributo Domain). No dia em que a Vercel trocou qual dos dois
# (wallet76.com vs www.wallet76.com) é o domínio "Production", quem já tinha
# sessão no domínio antigo ficou com "sessão expirada" ao abrir a app no
# domínio novo — o cookie simplesmente não é visível de um lado para o
# outro. Um Domain="wallet76.com" (sem "www.") cobre automaticamente
# wallet76.com E qualquer subdomínio, incluindo www.wallet76.com — a sessão
# passa a sobreviver a qual dos dois for a origem, sem precisar de voltar a
# fazer login sempre que a configuração de domínios mudar. Em desenvolvimento
# local (APP_URL vazio ou localhost) fica None, ou seja, sem atributo
# Domain — comportamento de sempre, preso ao localhost.
_cookie_domain_host = urlparse(APP_URL).hostname if APP_URL else ""
if _cookie_domain_host and _cookie_domain_host not in ("localhost", "127.0.0.1"):
    COOKIE_DOMAIN = _cookie_domain_host[4:] if _cookie_domain_host.startswith("www.") else _cookie_domain_host
else:
    COOKIE_DOMAIN = None

RP_ID = os.environ.get("WEBAUTHN_RP_ID", "")
RP_NAME = "Wallet76"

# --- Alertas multi-canal (11 jul 2026): Telegram + Web Push ---
# Ambas opcionais — se as variáveis não estiverem definidas, os respetivos
# endpoints/checker simplesmente não enviam nada (mesmo padrão do
# RESEND_API_KEY acima: "if not X: skip", nunca falha o arranque por causa
# de um canal em falta). Só BROKER_ENCRYPTION_KEY é obrigatória para arrancar
# (ver startup() em server.py) — estas não.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "")
# Enviado pelo Telegram no cabeçalho X-Telegram-Bot-Api-Secret-Token em cada
# chamada ao webhook — confirma que o pedido vem mesmo do Telegram e não de
# alguém a tentar chamar /webhooks/telegram diretamente. Se não estiver
# definido, gera-se um valor aleatório por processo (webhook ainda funciona,
# só não sobrevive a um restart do serviço sem novo setWebhook — aceitável
# para um canal opcional, mas o ideal é defini-la fixa no Render).
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET") or uuid.uuid4().hex

# Chaves VAPID para Web Push (geradas uma única vez, não por utilizador —
# identificam o SERVIDOR perante os serviços de push do browser, ex.: FCM
# para Chrome/Edge, Mozilla Push para Firefox). VAPID_CLAIM_EMAIL vai no
# "sub" claim do JWT VAPID — os serviços de push usam-no para poderem
# contactar o dono do servidor em caso de abuso.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "mailto:entredonos@gmail.com")

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


# 2FA (8 jul 2026) — token de curta duração emitido logo a seguir à
# password estar certa, mas ANTES de dar acesso: o login com 2FA ativo
# fica em dois passos (POST /auth/login -> {two_factor_required, pending_
# token}, depois POST /auth/2fa/verify com o código). Sem este token
# intermédio, nada impediria alguém de chamar /auth/2fa/verify direto,
# sem nunca ter acertado a password. Vida curta (10 min) e "type" próprio
# para não poder ser confundido/reutilizado como access_token.
def create_2fa_pending_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        "type": "2fa_pending",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_2fa_pending_token(token: str) -> str:
    """Devolve o user_id se o token for válido; lança 401 caso contrário."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Code expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    if payload.get("type") != "2fa_pending":
        raise HTTPException(status_code=401, detail="Invalid session")
    return payload["sub"]


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

    # last_active_at (6 jul 2026): "quanto tempo esta ligado por dia"
    # precisaria de heartbeats + sessões — decidido não fazer isso agora
    # (custo/bateria) e ficar só com "último acesso" / "ativo nas últimas
    # 24h", que dá para tirar disto sozinho. Guardado como string ISO, como
    # todos os outros timestamps do projeto (created_at, updated_at, etc.),
    # não como datetime nativo do Mongo. Throttled a 5 min: get_current_user
    # corre em TODOS os pedidos autenticados — escrever em cada um seria uma
    # escrita na BD por pedido só para mover um timestamp uns segundos.
    # Nome deliberadamente diferente de "last_seen"/"users_last_seen_at" já
    # usados em admin_state (ver routes/feedback.py) para o "visto pelo
    # admin" da tab Utilizadores — conceitos diferentes, sem relação.
    now = datetime.now(timezone.utc)
    last_active_raw = user.get("last_active_at")
    last_active_dt = datetime.fromisoformat(last_active_raw) if last_active_raw else None
    if not last_active_dt or (now - last_active_dt) > timedelta(minutes=5):
        now_iso = now.isoformat()
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_active_at": now_iso}})
        user["last_active_at"] = now_iso

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


async def write_auth_audit(event: str, request: Request, email: str = "", user_id: str = "", detail: str = "") -> None:
    """Log a security-relevant auth event (login success/failure, password
    reset) to the same `audit_logs` collection used for broker-sync events —
    the original audit only covered sync events, which meant a brute-forced
    or reset account left no trail here. Best-effort: never raises, so a
    logging hiccup can't break the auth flow it's recording."""
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "email": email,
            "event": event,
            "detail": detail,
            "ip": _client_ip(request),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"Failed to write auth audit log ({event}): {e}")


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


def cache_get_stale(key: str):
    """Returns the cached value for `key` regardless of age (ignores TTL),
    or None if nothing was ever cached for it. Used as a last-resort fallback
    when a live upstream fetch fails (e.g. CoinGecko rate limiting) — serving
    a few-minutes-stale but complete dataset beats falling back to a much
    smaller/lower-quality emergency source. See _fetch_movers_crypto in
    routes/market.py."""
    entry = _cache.get(key)
    return entry[1] if entry else None


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


def invalidate_history_cache(user_id: str) -> None:
    """Clears both /history cache namespaces (daily + intraday) for a user.
    Every transaction mutation route (create/update/delete/import/clear)
    needs to call both prefixes together — this was previously six copies
    of the same two-line pair spread across transactions.py, which risked
    drifting out of sync if a third cache namespace were ever added."""
    cache_clear_prefix(f"history_all:{user_id}:")
    cache_clear_prefix(f"history_intraday:{user_id}:")


# Aliases kept for backwards compat with existing route code
_cache_get = cache_get
_cache_set = cache_set
_cache_get_stale = cache_get_stale
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

# 9 jul 2026 — em produção, o browser/WebView fala sempre com wallet76.com
# (frontend na Vercel), mas o pedido chega aqui ao Render através do proxy
# definido em frontend/vercel.json (REGRA #5 do CLAUDE.md: sem isto o
# Safari/iOS bloqueia o cookie de sessão por ser cross-site). Esse proxy é
# transparente para cookies, mas o header "Host" que este backend recebe
# reflete o destino do proxy (o próprio domínio onrender.com), não o
# domínio público que o utilizador realmente vê. Antes desta correção,
# detect_rp_id()/origin_from_req() usavam sempre esse Host, por isso o
# WebAuthn calculava rp.id/origin = "...onrender.com" enquanto o browser
# via origin = "https://wallet76.com" — mismatch que o WebAuthn rejeita
# com "The relying party ID is not a registrable domain suffix...".
# APP_URL (== FRONTEND_URL, já uma variável obrigatória no Render — ver
# REGRA #4) dá-nos o domínio público real; passa a ser a fonte preferida,
# com o Host header só como fallback (ex.: desenvolvimento local).
_app_url_host = urlparse(APP_URL).hostname if APP_URL else ""


def b64url_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def detect_rp_id(req: Request) -> str:
    if RP_ID:
        return RP_ID
    if _app_url_host:
        return _app_url_host
    host = req.headers.get("host", "").split(":")[0]
    return host or "localhost"


def origin_from_req(req: Request) -> str:
    """Return the expected WebAuthn origin derived from the incoming request."""
    if APP_URL:
        return APP_URL.rstrip("/")
    host = req.headers.get("host", "localhost")
    # Strip port for comparison; browsers include it in origin
    scheme = "https" if req.headers.get("x-forwarded-proto") == "https" else "http"
    return f"{scheme}://{host}"

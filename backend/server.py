"""Wallet76 FastAPI entry point — thin router orchestration."""
import asyncio
import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from routes import billing as billing_routes

from core import db, client, logger, APP_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET  # noqa: F401  (loads .env via core import)
from alert_checker import run_alert_checker
from routes.portfolio import run_snapshot_scheduler
from routes.market import run_market_movers_refresher
from telegram_utils import set_telegram_webhook
from routes import (
    auth as auth_routes,
    wallets as wallets_routes,
    transactions as transactions_routes,
    portfolio as portfolio_routes,
    alerts as alerts_routes,
    search as search_routes,
    market as market_routes,
    watchlists as watchlists_routes,
    news as news_routes,
    preferences as preferences_routes,
    security as security_routes,
    share as share_routes,
    brokers as broker_routes,
    asset as asset_routes,
    analytics as analytics_routes,
    feedback as feedback_routes,
    allocation as allocation_routes,
    notifications as notifications_routes,
    referrals as referrals_routes,
)

# Render sets RENDER=true automatically on every deployed instance — use it
# to disable the interactive API docs (which would otherwise fully enumerate
# every route, including admin ones) in production while keeping them
# available for local development.
_is_production = bool(os.environ.get("RENDER"))
app = FastAPI(
    title="Wallet76 API",
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)
api_router = APIRouter(prefix="/api")
@app.get("/ping")
async def ping():
    return {"ok": True, "app": "wallet76"}


@api_router.get("/")
async def root():
    return {"message": "Portfolio Tracker API"}


# Mount all sub-routers under /api
for sub in (
    auth_routes,
    billing_routes,
    wallets_routes,
    transactions_routes,
    portfolio_routes,
    alerts_routes,
    search_routes,
    market_routes,
    watchlists_routes,
    news_routes,
    preferences_routes,
    security_routes,
    share_routes,
    broker_routes,
    asset_routes,
    analytics_routes,
    feedback_routes,
    allocation_routes,
    notifications_routes,
    referrals_routes,
):
    api_router.include_router(sub.router)

app.include_router(api_router)

allowed_origins = [
    "https://wallet76.com",
    "https://www.wallet76.com",
    "https://wallet76.vercel.app",
    "http://localhost:3000",
]

frontend_url = os.environ.get("FRONTEND_URL")
if frontend_url and frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _ensure_indexes():
    """Creates all MongoDB indexes. Runs as a background task (see startup()
    below) instead of being awaited directly during FastAPI startup.

    Why: each of these is a network round-trip to MongoDB Atlas. If Atlas is
    briefly unreachable (paused free-tier cluster, network hiccup, IP
    allowlist change, etc.), every one of these ~15 sequential awaits can
    hang for the full server-selection timeout before failing over — worst
    case several minutes of total blocking. While `startup()` hadn't
    returned, uvicorn never finished "Waiting for application startup" and
    never bound its port, so Render's port scan timed out and killed the
    instance — a full outage caused by a slow/unreachable DB, not a real
    crash. Backgrounding this means the app always binds its port and starts
    serving immediately; if Mongo really is down, individual DB-backed
    routes fail with a normal error instead of the whole process refusing
    to start.
    """
    async def _idx(*args, **kwargs):
        try:
            await args[0].create_index(*args[1:], **kwargs)
        except Exception as e:
            logger.debug(f"Index already exists (skipping): {e}")

    try:
        await db.snapshots.drop_index("user_id_1_date_1")
    except Exception:
        pass

    await _idx(db.users, "email", unique=True)
    await _idx(db.users, "verify_token_hash", sparse=True)
    await _idx(db.users, "reset_token_hash", sparse=True)
    await _idx(db.wallets, [("user_id", 1)])
    await _idx(db.transactions, [("user_id", 1), ("wallet_id", 1)])
    await _idx(db.transactions, [("user_id", 1), ("date", -1)])
    await _idx(db.snapshots, [("user_id", 1), ("bucket_ts", 1)], unique=True, sparse=True)
    await _idx(db.alerts, [("user_id", 1), ("active", 1)])
    await _idx(db.watchlists, [("user_id", 1)])
    await _idx(db.watchlists, [("user_id", 1), ("group_id", 1)])
    await _idx(db.watchlist_groups, [("user_id", 1)])
    await _idx(db.user_prefs, [("user_id", 1)], unique=True)
    await _idx(db.allocation_prefs, [("user_id", 1)], unique=True)
    await _idx(db.share_links, [("user_id", 1)])
    await _idx(db.share_links, [("slug", 1)], unique=True, sparse=True)
    # Alertas multi-canal (11 jul 2026)
    await _idx(db.telegram_links, [("user_id", 1)], unique=True)
    await _idx(db.telegram_link_codes, [("code", 1)], unique=True)
    await _idx(db.push_subscriptions, [("endpoint", 1)], unique=True)
    await _idx(db.push_subscriptions, [("user_id", 1)])
    # Programa de referral (14 jul 2026)
    await _idx(db.users, "referral_code", unique=True, sparse=True)
    await _idx(db.referrals, [("referrer_id", 1), ("status", 1)])
    await _idx(db.referrals, [("referred_user_id", 1)], unique=True, sparse=True)
    logger.info("MongoDB indexes ensured.")


@app.on_event("startup")
async def startup():
    # BROKER_ENCRYPTION_KEY is a plain env-var read (no network round trip),
    # so checking it here is instant and safe to do synchronously — unlike
    # _ensure_indexes() below, this can't hang. Fail startup loudly if it's
    # missing rather than letting broker_connectors/crypto.py silently
    # generate a throwaway key later (see that module's docstring for why
    # that used to be dangerous on a free-tier instance that restarts often).
    if not os.environ.get("BROKER_ENCRYPTION_KEY"):
        logger.critical(
            "BROKER_ENCRYPTION_KEY is not set — refusing to start. "
            "Set it in the environment before deploying."
        )
        raise RuntimeError("BROKER_ENCRYPTION_KEY is not set")

    # Fire-and-forget — see _ensure_indexes() docstring for why this must
    # NOT be awaited here.
    asyncio.create_task(_ensure_indexes())

    # Keeps portfolio snapshot history growing every 15 min for every user,
    # independent of whether anyone has the app open (see run_snapshot_scheduler
    # docstring in routes/portfolio.py).
    asyncio.create_task(run_snapshot_scheduler())

    # Was previously imported but never started — price alerts (and their
    # email notifications) were not actually being checked periodically.
    asyncio.create_task(run_alert_checker())

    # Keeps the Market tab's movers cache warm so users don't pay the ~20s
    # cold-cache cost themselves (mostly yfinance's batch download of ~100
    # stock tickers in market_movers_stocks) — see run_market_movers_refresher
    # docstring in routes/market.py.
    asyncio.create_task(run_market_movers_refresher())

    # Regista o webhook do Telegram automaticamente sempre que
    # TELEGRAM_BOT_TOKEN estiver definido — zero passos manuais além de
    # criar o bot no @BotFather e pôr o token no Render (ver
    # routes/notifications.py e telegram_utils.py). Sem TELEGRAM_BOT_TOKEN,
    # set_telegram_webhook() não faz nada (mesmo padrão "skip se não
    # configurado" do resto dos canais opcionais).
    if TELEGRAM_BOT_TOKEN and APP_URL:
        asyncio.create_task(
            set_telegram_webhook(f"{APP_URL.rstrip('/')}/api/webhooks/telegram", TELEGRAM_WEBHOOK_SECRET)
        )



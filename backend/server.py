"""Wallet76 FastAPI entry point — thin router orchestration."""
import asyncio
import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from routes import billing as billing_routes

from core import db, client, logger  # noqa: F401  (loads .env via core import)
from alert_checker import run_alert_checker
from routes.portfolio import run_snapshot_scheduler
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
)

app = FastAPI(title="Wallet76 API")
api_router = APIRouter(prefix="/api")
@app.get("/ping")
async def ping():
    return {"ok": True, "app": "wallet76"}


@app.get("/debug/promote-admin")
async def debug_promote_admin():
    """TEMPORARY — remove after use. Atlas TLS outage forced a cluster
    recreation (new empty database), so the account seed script can't be
    run locally against production without reconfiguring a local .env.
    This does the same thing admin_tools.py's promote_user() does, over
    HTTP, once, for the site owner's own account only.
    """
    email = "entredonos@gmail.com"
    res = await db.users.update_one(
        {"email": email},
        {"$set": {
            "role": "admin",
            "subscription_status": "active",
            "subscription_plan": "admin",
        }},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": f"user not found: {email}"}
    return {"ok": True, "email": email, "modified": res.modified_count}


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
    logger.info("MongoDB indexes ensured.")


@app.on_event("startup")
async def startup():
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



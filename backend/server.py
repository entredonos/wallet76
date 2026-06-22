"""Wallet76 FastAPI entry point — thin router orchestration."""
import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from routes import billing as billing_routes

from core import db, client, logger  # noqa: F401  (loads .env via core import)
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
)

app = FastAPI(title="Wallet76 API")
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

print("\n=== ROUTES ===")
for r in app.routes:
    print(r.path)
print("==============\n")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("verify_token_hash", sparse=True)
    await db.users.create_index("reset_token_hash", sparse=True)
    await db.wallets.create_index([("user_id", 1)])
    await db.transactions.create_index([("user_id", 1), ("wallet_id", 1)])
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    try:
        await db.snapshots.drop_index("user_id_1_date_1")
    except Exception:
        pass
    await db.snapshots.create_index([("user_id", 1), ("bucket_ts", 1)], unique=True, sparse=True)
    await db.alerts.create_index([("user_id", 1), ("active", 1)])
    await db.watchlists.create_index([("user_id", 1)])
    await db.watchlists.create_index([("user_id", 1), ("group_id", 1)])
    await db.watchlist_groups.create_index([("user_id", 1)])
    await db.user_prefs.create_index([("user_id", 1)], unique=True)
    await db.user_security.create_index([("user_id", 1)], unique=True)


@app.on_event("shutdown")
async def shutdown():
    client.close()

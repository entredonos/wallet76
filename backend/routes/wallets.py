"""Wallet endpoints + per-wallet 7d sparkline."""
import asyncio
import uuid
from datetime import datetime, timezone

import yfinance as yf
from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, require_active_subscription, _cache_get, _cache_set
from models import WalletCreate, WalletUpdate
from prices import compute_holdings_from_txns

router = APIRouter()


@router.get("/wallets/sparklines")
async def get_wallets_sparklines(user=Depends(require_active_subscription)):
    """Returns {wallet_id: [last 7 daily portfolio totals]} from holdings × 7d closes."""
    cache_key = f"wallet_sparks:{user['id']}"
    cached = _cache_get(cache_key, ttl=900)
    if cached:
        return cached

    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    holdings = compute_holdings_from_txns(txns)
    if not holdings:
        return {}

    asset_keys = {}
    for h in holdings:
        if h.get("quantity", 0) <= 0:
            continue
        key = (h["asset_type"], h["symbol"].upper(), h.get("coingecko_id"))
        asset_keys.setdefault(key, []).append((h["wallet_id"], h["quantity"]))

    def _fetch_7d_closes(asset_type, symbol, cgid):
        yf_sym = f"{symbol}-USD" if asset_type == "crypto" else symbol
        ck = f"sparkw7d:{asset_type}:{symbol}"
        c = _cache_get(ck, ttl=3600)
        if c is not None:
            return c
        closes = []
        try:
            hist = yf.Ticker(yf_sym).history(period="8d", interval="1d")
            if not hist.empty:
                closes = [float(x) for x in hist["Close"].dropna().tolist()][-7:]
        except Exception:
            closes = []
        _cache_set(ck, closes)
        return closes

    futures = [
        asyncio.to_thread(_fetch_7d_closes, k[0], k[1], k[2])
        for k in asset_keys.keys()
    ]
    closes_all = await asyncio.gather(*futures)

    wallet_series = {}
    for (key, owners), closes in zip(asset_keys.items(), closes_all):
        if not closes:
            continue
        for (wid, qty) in owners:
            arr = wallet_series.setdefault(wid, [0.0] * len(closes))
            n = min(len(arr), len(closes))
            for i in range(n):
                arr[i] += closes[i] * qty
            if len(closes) > len(arr):
                arr.extend([0.0] * (len(closes) - len(arr)))

    _cache_set(cache_key, wallet_series)
    return wallet_series


@router.get("/wallets")
async def list_wallets(user=Depends(require_active_subscription)):
    return await db.wallets.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)


@router.post("/wallets")
async def create_wallet(payload: WalletCreate, user=Depends(require_active_subscription)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": payload.name,
        "type": payload.type,
        "currency": payload.currency,
        "icon": payload.icon or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/wallets/{wallet_id}")
async def update_wallet(wallet_id: str, payload: WalletUpdate, user=Depends(require_active_subscription)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.wallets.update_one({"id": wallet_id, "user_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Wallet not found")
    return await db.wallets.find_one({"id": wallet_id}, {"_id": 0})


@router.delete("/wallets/{wallet_id}")
async def delete_wallet(wallet_id: str, user=Depends(require_active_subscription)):
    await db.assets.delete_many({"wallet_id": wallet_id, "user_id": user["id"]})
    await db.transactions.delete_many({"wallet_id": wallet_id, "user_id": user["id"]})
    res = await db.wallets.delete_one({"id": wallet_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Wallet not found")
    return {"ok": True}

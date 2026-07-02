"""Watchlist groups + items."""
import asyncio
import uuid
from datetime import datetime, timezone

import httpx
import yfinance as yf
from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, is_pro_user, _cache_get, _cache_set, logger
from models import WatchlistCreate, WatchlistUpdate, WatchlistGroupCreate
from prices import get_crypto_prices, get_stock_prices

router = APIRouter()

FREE_GROUP_LIMIT = 1
FREE_ITEMS_PER_GROUP_LIMIT = 10
PRO_GROUP_LIMIT = 20
PRO_ITEMS_PER_GROUP_LIMIT = 20


@router.get("/watchlist-groups")
async def list_watchlist_groups(user=Depends(get_current_user)):
    """Returns groups with their items embedded; ensures a default group exists."""
    groups = await db.watchlist_groups.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    if not groups:
        default = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "name": "Default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.watchlist_groups.insert_one(default)
        default.pop("_id", None)
        groups = [default]

    items = await db.watchlists.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    default_gid = groups[0]["id"]
    legacy = [it for it in items if not it.get("group_id")]
    if legacy:
        await db.watchlists.update_many(
            {"user_id": user["id"], "$or": [{"group_id": {"$exists": False}}, {"group_id": None}]},
            {"$set": {"group_id": default_gid}},
        )
        for it in legacy:
            it["group_id"] = default_gid

    crypto_ids = [w["coingecko_id"] for w in items if w["asset_type"] == "crypto" and w.get("coingecko_id")]
    stock_syms = [w["symbol"] for w in items if w["asset_type"] == "stock"]
    crypto_prices, stock_prices = await asyncio.gather(
        get_crypto_prices(crypto_ids),
        get_stock_prices(stock_syms),
    )

    crypto_markets = {}
    if crypto_ids:
        cache_key = f"watch_markets:{','.join(sorted(set(crypto_ids)))}"
        cached = _cache_get(cache_key, ttl=180)
        if cached:
            crypto_markets = cached
        else:
            try:
                async with httpx.AsyncClient(timeout=10) as ch:
                    r = await ch.get(
                        "https://api.coingecko.com/api/v3/coins/markets",
                        params={
                            "vs_currency": "usd",
                            "ids": ",".join(sorted(set(crypto_ids))),
                            "price_change_percentage": "7d,30d",
                            "sparkline": "true",
                        },
                    )
                    if r.status_code == 200:
                        for row in r.json():
                            sp = (row.get("sparkline_in_7d") or {}).get("price") or []
                            spark24 = sp[-24:] if len(sp) >= 24 else sp
                            crypto_markets[row["id"]] = {
                                "market_cap_usd": row.get("market_cap"),
                                "volume_24h_usd": row.get("total_volume"),
                                "pct_7d": row.get("price_change_percentage_7d_in_currency"),
                                "pct_30d": row.get("price_change_percentage_30d_in_currency"),
                                "sparkline_24h": spark24,
                                "high_24h_usd": row.get("high_24h"),
                                "low_24h_usd": row.get("low_24h"),
                            }
                        _cache_set(cache_key, crypto_markets)
            except Exception as e:
                logger.warning(f"watchlist markets err: {e}")

    def _fetch_stock_extras(symbol):
        cache_key = f"watch_stock_x:{symbol}"
        cached = _cache_get(cache_key, ttl=600)
        if cached:
            return cached
        out = {"market_cap_usd": None, "volume_24h_usd": None, "sparkline_24h": [], "pct_7d": None, "pct_30d": None}
        try:
            t = yf.Ticker(symbol)
            info = getattr(t, "fast_info", None)
            if info:
                try:
                    out["market_cap_usd"] = float(info.get("market_cap") or 0) or None
                except Exception:
                    pass
                try:
                    out["volume_24h_usd"] = float(info.get("last_volume") or 0) or None
                except Exception:
                    pass
            hist = t.history(period="1d", interval="15m")
            if hist.empty:
                hist = t.history(period="5d", interval="1h")
            if not hist.empty:
                out["sparkline_24h"] = [float(c) for c in hist["Close"].tolist()][-30:]
            hist7 = t.history(period="7d", interval="1d")
            if not hist7.empty and len(hist7) > 1:
                first = float(hist7["Close"].iloc[0])
                last = float(hist7["Close"].iloc[-1])
                if first:
                    out["pct_7d"] = (last - first) / first * 100.0
        except Exception as e:
            logger.warning(f"watchlist stock extras {symbol} err: {e}")
        _cache_set(cache_key, out)
        return out

    stock_extras = {}
    if stock_syms:
        extras_results = await asyncio.gather(*[asyncio.to_thread(_fetch_stock_extras, s) for s in stock_syms])
        stock_extras = dict(zip(stock_syms, extras_results))

    enriched_items = []
    for w in items:
        price = 0
        change_24h = 0
        extras = {"market_cap_usd": None, "volume_24h_usd": None, "sparkline_24h": [], "pct_7d": None, "pct_30d": None, "high_24h_usd": None, "low_24h_usd": None}
        if w["asset_type"] == "crypto" and w.get("coingecko_id"):
            p = crypto_prices.get(w["coingecko_id"], {})
            price = float(p.get("usd") or 0)
            change_24h = float(p.get("usd_24h_change") or 0)
            ex = crypto_markets.get(w["coingecko_id"]) or {}
            extras.update(ex)
            if not price or not extras.get("sparkline_24h"):
                yf_sym = f"{w['symbol'].upper()}-USD"
                yf_ex = await asyncio.to_thread(_fetch_stock_extras, yf_sym)
                if not price:
                    try:
                        last = (yf_ex.get("sparkline_24h") or [])
                        if last:
                            price = float(last[-1])
                    except Exception:
                        pass
                if not extras.get("sparkline_24h"):
                    extras["sparkline_24h"] = yf_ex.get("sparkline_24h", [])
                if extras.get("pct_7d") is None:
                    extras["pct_7d"] = yf_ex.get("pct_7d")
        elif w["asset_type"] == "stock":
            p = stock_prices.get(w["symbol"].upper(), {})
            price = float(p.get("usd") or 0)
            change_24h = float(p.get("change_pct") or 0)
            ex = stock_extras.get(w["symbol"]) or {}
            extras.update(ex)
        enriched_items.append({**w, "price_usd": price, "change_24h": change_24h, **extras})

    out = []
    for g in groups:
        group_items = [it for it in enriched_items if it.get("group_id") == g["id"]]
        out.append({**g, "items": group_items})
    return out


@router.post("/watchlist-groups")
async def create_watchlist_group(payload: WatchlistGroupCreate, user=Depends(get_current_user)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "Name required")
    count = await db.watchlist_groups.count_documents({"user_id": user["id"]})
    limit = PRO_GROUP_LIMIT if is_pro_user(user) else FREE_GROUP_LIMIT
    if count >= limit:
        raise HTTPException(402, detail={"reason": "watchlist_group_limit", "limit": limit})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.watchlist_groups.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "items": []}


@router.delete("/watchlist-groups/{gid}")
async def delete_watchlist_group(gid: str, user=Depends(get_current_user)):
    grp = await db.watchlist_groups.find_one({"id": gid, "user_id": user["id"]})
    if not grp:
        raise HTTPException(404, "Group not found")
    await db.watchlists.delete_many({"user_id": user["id"], "group_id": gid})
    await db.watchlist_groups.delete_one({"id": gid, "user_id": user["id"]})
    return {"ok": True}


@router.get("/watchlists")
async def list_watchlists(user=Depends(get_current_user)):
    items = await db.watchlists.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    if not items:
        return []
    crypto_ids = [w["coingecko_id"] for w in items if w["asset_type"] == "crypto" and w.get("coingecko_id")]
    stock_syms = [w["symbol"] for w in items if w["asset_type"] == "stock"]
    crypto_prices, stock_prices = await asyncio.gather(
        get_crypto_prices(crypto_ids),
        get_stock_prices(stock_syms),
    )
    out = []
    for w in items:
        price = 0
        change_24h = 0
        if w["asset_type"] == "crypto" and w.get("coingecko_id"):
            p = crypto_prices.get(w["coingecko_id"], {})
            price = float(p.get("usd") or 0)
            change_24h = float(p.get("usd_24h_change") or 0)
        elif w["asset_type"] == "stock":
            p = stock_prices.get(w["symbol"].upper(), {})
            price = float(p.get("usd") or 0)
            change_24h = float(p.get("change_pct") or 0)
        out.append({**w, "price_usd": price, "change_24h": change_24h})
    return out


@router.post("/watchlists")
async def create_watchlist(payload: WatchlistCreate, user=Depends(get_current_user)):
    group_id = payload.group_id
    if not group_id:
        grp = await db.watchlist_groups.find_one({"user_id": user["id"]}, sort=[("created_at", 1)])
        if not grp:
            grp = {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "name": "Default",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.watchlist_groups.insert_one(grp)
        group_id = grp["id"]
    else:
        owner = await db.watchlist_groups.find_one({"id": group_id, "user_id": user["id"]})
        if not owner:
            raise HTTPException(404, "Group not found")

    count_in_group = await db.watchlists.count_documents({"user_id": user["id"], "group_id": group_id})
    item_limit = PRO_ITEMS_PER_GROUP_LIMIT if is_pro_user(user) else FREE_ITEMS_PER_GROUP_LIMIT
    if count_in_group >= item_limit:
        raise HTTPException(402, detail={"reason": "watchlist_item_limit", "limit": item_limit})
    existing = await db.watchlists.find_one({
        "user_id": user["id"],
        "group_id": group_id,
        "symbol": payload.symbol.upper().strip(),
        "asset_type": payload.asset_type,
    })
    if existing:
        raise HTTPException(400, "Asset already in this sub-watchlist")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "group_id": group_id,
        "symbol": payload.symbol.upper().strip(),
        "asset_type": payload.asset_type,
        "coingecko_id": (payload.coingecko_id or "").lower().strip() or None,
        "custom_label": payload.custom_label or payload.symbol.upper(),
        "name": payload.name or payload.symbol.upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.watchlists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/watchlists/{wid}")
async def update_watchlist(wid: str, payload: WatchlistUpdate, user=Depends(get_current_user)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.watchlists.update_one({"id": wid, "user_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.watchlists.find_one({"id": wid}, {"_id": 0})


@router.delete("/watchlists/{wid}")
async def delete_watchlist(wid: str, user=Depends(get_current_user)):
    res = await db.watchlists.delete_one({"id": wid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

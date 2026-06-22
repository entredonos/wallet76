"""Portfolio view (live prices) + FX + snapshots + history + per-asset sparklines."""
import asyncio
from datetime import datetime, timezone, timedelta

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends

from core import db, get_current_user, require_active_subscription, _cache_get, _cache_set, logger
from prices import (
    compute_holdings_from_txns, migrate_legacy_assets,
    get_crypto_prices, get_stock_prices, get_fx_rates,
)

router = APIRouter()


@router.get("/fx")
async def fx_endpoint():
    return await get_fx_rates()


@router.get("/portfolio")
async def get_portfolio(user=Depends(require_active_subscription)):
    """Returns enriched holdings (from transactions) with live prices + summary."""
    await migrate_legacy_assets(user["id"])
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    wallets = await db.wallets.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    holdings = compute_holdings_from_txns(txns)

    crypto_ids = [
    h.get("coingecko_id") or h["symbol"].lower()
    for h in holdings
    if h["asset_type"] == "crypto" and h["quantity"] > 0
]
    stock_syms = [h["symbol"] for h in holdings if h["asset_type"] == "stock" and h["quantity"] > 0]

    crypto_prices, stock_prices, fx_rates = await asyncio.gather(
        get_crypto_prices(crypto_ids),
        get_stock_prices(stock_syms),
        get_fx_rates(),
    )
    eur_rate = fx_rates["EUR"]
    chf_rate = fx_rates["CHF"]

    enriched = []
    total_usd = 0.0
    total_cost = 0.0
    total_daily_change = 0.0
    total_realized = 0.0
    for h in holdings:
        price_usd = 0.0
        change_24h = 0.0
        if h["asset_type"] == "crypto":
            cg_id = h.get("coingecko_id") or h["symbol"].lower()
            p = crypto_prices.get(cg_id, {})
            price_usd = float(p.get("usd") or 0)
            change_24h = float(p.get("usd_24h_change") or 0)
        elif h["asset_type"] == "stock":
            p = stock_prices.get(h["symbol"].upper(), {})
            price_usd = float(p.get("usd") or 0)
            change_24h = float(p.get("change_pct") or 0)

        value = price_usd * h["quantity"]
        cost = h["avg_cost_usd"] * h["quantity"]
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0
        daily_change_value = value * (change_24h / 100) if change_24h else 0
        enriched.append({
            **h,
            "avg_price": h["avg_cost_usd"],
            "price_usd": price_usd,
            "price_eur": price_usd * eur_rate,
            "price_chf": price_usd * chf_rate,
            "value_usd": value,
            "value_eur": value * eur_rate,
            "value_chf": value * chf_rate,
            "cost_usd": cost,
            "pnl_usd": pnl,
            "pnl_pct": pnl_pct,
            "change_24h": change_24h,
            "daily_change_usd": daily_change_value,
        })
        total_usd += value
        total_cost += cost
        total_daily_change += daily_change_value
        total_realized += h.get("realized_pnl_usd", 0.0)

    total_pnl = total_usd - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    now = datetime.now(timezone.utc)
    bucket_minute = (now.minute // 15) * 15
    bucket = now.replace(minute=bucket_minute, second=0, microsecond=0)
    bucket_ts = bucket.isoformat()
    today = now.date().isoformat()
    await db.snapshots.update_one(
        {"user_id": user["id"], "bucket_ts": bucket_ts},
        {"$set": {
            "user_id": user["id"],
            "bucket_ts": bucket_ts,
            "date": today,
            "total_usd": total_usd,
            "total_pnl_usd": total_pnl,
            "timestamp": now.isoformat(),
        }},
        upsert=True,
    )

    # Active alerts
    triggered = []
    alerts_cursor = db.alerts.find({"user_id": user["id"], "active": True})
    async for a in alerts_cursor:
        sym = a.get("symbol", "").upper()
        match = next((e for e in enriched if e["symbol"].upper() == sym and e["asset_type"] == a.get("asset_type")), None)
        if not match:
            continue
        price = match["price_usd"]
        if not price:
            continue
        target = float(a.get("target_price_usd") or 0)
        cond = a.get("condition")
        hit = (cond == "above" and price >= target) or (cond == "below" and price <= target)
        if hit:
            await db.alerts.update_one(
                {"id": a["id"]},
                {"$set": {"active": False, "triggered_at": now.isoformat(), "triggered_price_usd": price}},
            )
            triggered.append({
                "id": a["id"],
                "symbol": sym,
                "asset_type": a.get("asset_type"),
                "condition": cond,
                "target_price_usd": target,
                "triggered_price_usd": price,
                "name": a.get("name") or sym,
            })

    return {
        "assets": enriched,
        "wallets": wallets,
        "summary": {
            "total_usd": total_usd,
            "total_eur": total_usd * eur_rate,
            "total_chf": total_usd * chf_rate,
            "total_cost_usd": total_cost,
            "total_pnl_usd": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "total_realized_pnl_usd": total_realized,
            "total_daily_change_usd": total_daily_change,
            "eur_rate": eur_rate,
            "chf_rate": chf_rate,
            "fx_rates": fx_rates,
        },
        "triggered_alerts": triggered,
    }


@router.get("/snapshots")
async def get_snapshots(user=Depends(require_active_subscription)):
    return await db.snapshots.find({"user_id": user["id"]}, {"_id": 0}).sort("bucket_ts", 1).to_list(2000)


@router.get("/history")
async def get_history(range: str = "1w", user=Depends(require_active_subscription)):
    """Portfolio history bucketed at 15-min intervals. range: 30m|1h|2h|4h|1d|1w|1m|1y|all
    For range="all": retroactively reconstructs daily portfolio value from the first
    transaction date using yfinance/CoinGecko daily closes (cached 30 min).
    """
    now = datetime.now(timezone.utc)

    if range == "all":
        cache_key = f"history_all:{user['id']}"
        cached = _cache_get(cache_key, ttl=1800)
        if cached:
            return cached
        result = await _build_retro_history(user["id"])
        _cache_set(cache_key, result)
        return result

    deltas = {
        "30m": timedelta(minutes=30),
        "1h": timedelta(hours=1),
        "2h": timedelta(hours=2),
        "4h": timedelta(hours=4),
        "1d": timedelta(days=1),
        "1w": timedelta(days=7),
        "1m": timedelta(days=30),
        "1y": timedelta(days=365),
    }
    query = {"user_id": user["id"]}
    if range in deltas:
        cutoff = (now - deltas[range]).isoformat()
        query["bucket_ts"] = {"$gte": cutoff}
    snaps = await db.snapshots.find(query, {"_id": 0}).sort("bucket_ts", 1).to_list(5000)
    return [
        {
            "ts": s.get("bucket_ts") or s.get("date"),
            "date": s.get("date"),
            "total_usd": s.get("total_usd", 0),
            "total_pnl_usd": s.get("total_pnl_usd", 0),
        }
        for s in snaps
    ]


async def _build_retro_history(user_id: str):
    """Walk every transaction since day 1 and compute daily portfolio value.

    Uses yfinance daily closes per asset (cached per-symbol). For each day in
    [first_tx_date, today] we apply all txns up to that day and multiply
    qty × close_price for each held asset.
    """
    import pandas as pd
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    if not txns:
        return []
    txns.sort(key=lambda t: t.get("date", ""))
    first_date = txns[0].get("date", "")[:10]
    try:
        start = datetime.fromisoformat(first_date).date()
    except (TypeError, ValueError):
        return []
    end = datetime.now(timezone.utc).date()
    if start > end:
        return []

    # Unique assets
    assets = {}
    for t in txns:
        key = (t["asset_type"], t["symbol"].upper())
        assets.setdefault(key, {"asset_type": t["asset_type"], "symbol": t["symbol"].upper()})

    # Fetch close-price series per asset (yfinance for stocks; <SYM>-USD for crypto)
    def _fetch_closes(asset_type: str, symbol: str):
        ck = f"retro_closes:{asset_type}:{symbol}"
        cached = _cache_get(ck, ttl=3600)
        if cached is not None:
            return cached
        yf_sym = f"{symbol}-USD" if asset_type == "crypto" else symbol
        try:
            t = yf.Ticker(yf_sym)
            hist = t.history(period="max", interval="1d")
            if hist.empty:
                _cache_set(ck, {})
                return {}
            series = {}
            for ts, row in hist.iterrows():
                day = ts.date().isoformat()
                close = row.get("Close")
                if pd.notna(close):
                    series[day] = float(close)
            _cache_set(ck, series)
            return series
        except Exception as e:
            logger.warning(f"retro closes {yf_sym} err: {e}")
            _cache_set(ck, {})
            return {}

    keys = list(assets.keys())
    closes_per_asset = await asyncio.gather(*[
        asyncio.to_thread(_fetch_closes, k[0], k[1]) for k in keys
    ])
    closes_map = {k: c for k, c in zip(keys, closes_per_asset)}

    # Walk daily
    days = []
    cur = start
    while cur <= end:
        days.append(cur)
        cur += timedelta(days=1)

    # Track running qty + last-known price per asset
    qty = {k: 0.0 for k in keys}
    last_price = {k: 0.0 for k in keys}
    cost = {k: 0.0 for k in keys}

    txns_by_day = {}
    for t in txns:
        day = t.get("date", "")[:10]
        txns_by_day.setdefault(day, []).append(t)

    result = []
    for day in days:
        day_iso = day.isoformat()
        # apply txns up to (and including) this day
        for t in txns_by_day.get(day_iso, []):
            key = (t["asset_type"], t["symbol"].upper())
            fx = float(t.get("fx_to_usd") or 1.0)
            q = float(t["quantity"])
            p_usd = float(t["price"]) * fx
            if t["type"] == "BUY":
                qty[key] += q
                cost[key] += q * p_usd + float(t.get("fee", 0)) * fx
            else:  # SELL
                sell_q = min(q, qty[key])
                if qty[key] > 0:
                    avg = cost[key] / qty[key]
                    cost[key] -= avg * sell_q
                qty[key] -= sell_q
                if qty[key] < 1e-9:
                    qty[key] = 0
                    cost[key] = 0
        # Compute value
        total_v = 0.0
        for k in keys:
            if qty[k] <= 0:
                continue
            series = closes_map.get(k, {})
            price = series.get(day_iso)
            if price is None:
                # fall back to the most recent known close on/before this day
                price = last_price[k]
                # try iterating series keys (sorted) — but lookup is expensive,
                # just use last_price which we update below.
            else:
                last_price[k] = price
            total_v += qty[k] * (price or 0)
        total_cost = sum(cost.values())
        result.append({
            "ts": day_iso,
            "date": day_iso,
            "total_usd": total_v,
            "total_pnl_usd": total_v - total_cost,
        })
    return result


@router.get("/sparklines")
async def get_sparklines(user=Depends(require_active_subscription)):
    """Returns 24h price series for each held asset."""
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    holdings = [h for h in compute_holdings_from_txns(txns) if h["quantity"] > 0]
    if not holdings:
        return {}

    async def _fetch_crypto(h):
        cg = h.get("coingecko_id")
        if not cg:
            return None
        cache_key = f"spark_c:{cg}"
        cached = _cache_get(cache_key, ttl=600)
        if cached:
            return cached
        try:
            async with httpx.AsyncClient(timeout=10) as ch:
                r = await ch.get(
                    f"https://api.coingecko.com/api/v3/coins/{cg}/market_chart",
                    params={"vs_currency": "usd", "days": "1"},
                )
                if r.status_code != 200:
                    return None
                prices = r.json().get("prices", [])
                pts = [{"t": p[0], "p": p[1]} for p in prices]
                _cache_set(cache_key, pts)
                return pts
        except Exception as e:
            logger.warning(f"sparkline crypto {cg} err: {e}")
            return None

    def _fetch_stock(symbol):
        cache_key = f"spark_s:{symbol}"
        cached = _cache_get(cache_key, ttl=600)
        if cached:
            return cached
        try:
            t = yf.Ticker(symbol)
            hist = t.history(period="1d", interval="15m")
            if hist.empty:
                hist = t.history(period="5d", interval="1h")
            if hist.empty:
                return None
            pts = []
            for ts, row in hist.iterrows():
                pts.append({"t": int(ts.timestamp() * 1000), "p": float(row["Close"])})
            _cache_set(cache_key, pts)
            return pts
        except Exception as e:
            logger.warning(f"sparkline stock {symbol} err: {e}")
            return None

    async def _fetch_stock_async(h):
        pts = await asyncio.to_thread(_fetch_stock, h["symbol"])
        if not pts:
            resolved = _cache_get(f"resolve:{h['symbol'].lower()}", ttl=86400)
            if resolved and resolved != h["symbol"]:
                pts = await asyncio.to_thread(_fetch_stock, resolved)
        return pts

    tasks = []
    keys = []
    for h in holdings:
        key = f"{h['asset_type']}:{h['symbol'].upper()}"
        keys.append(key)
        if h["asset_type"] == "crypto":
            tasks.append(_fetch_crypto(h))
        else:
            tasks.append(_fetch_stock_async(h))

    all_pts = await asyncio.gather(*tasks)
    return {k: pts for k, pts in zip(keys, all_pts) if pts}

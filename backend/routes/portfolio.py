"""Portfolio view (live prices) + FX + snapshots + history + per-asset sparklines."""
import asyncio
import time
from datetime import datetime, timezone, timedelta

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends

from core import db, get_current_user, _cache_get, _cache_set, logger
from prices import (
    compute_holdings_from_txns, migrate_legacy_assets,
    get_crypto_prices, get_stock_prices, get_fx_rates,
    detect_and_fix_equity_types, backfill_holding_names,
)
from routes.news import _fetch_yf, _fetch_crypto_ohlc

router = APIRouter()

# 15m/30m/1h/4h use retroactive reconstruction (see _build_retro_history_intraday)
# instead of real snapshots, since snapshots only exist from whenever an
# account started being tracked.
_INTRADAY_RETRO_RANGES = {"15m", "30m", "1h", "4h"}


@router.get("/fx")
async def fx_endpoint():
    return await get_fx_rates()


EQUITY_TYPES = ("stock", "etf", "fund", "bond", "reit")


async def _price_holdings(user_id: str) -> dict:
    """Computes live-priced holdings for a user: fetches transactions,
    current crypto/stock prices and FX rates, and returns the enriched
    holdings + portfolio totals. Shared by the live GET /portfolio endpoint
    and the periodic snapshot scheduler (see run_snapshot_scheduler below) —
    one source of truth for "what is this portfolio worth right now"."""
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    holdings = compute_holdings_from_txns(txns)

    crypto_ids = [
        h.get("coingecko_id") or h["symbol"].lower()
        for h in holdings
        if h["asset_type"] == "crypto" and h["quantity"] > 0
    ]
    # ETFs, funds and bonds are priced via yfinance just like stocks
    stock_syms = [
        h["symbol"] for h in holdings
        if h["asset_type"] in EQUITY_TYPES and h["quantity"] > 0
    ]

    # backfill_holding_names mutates `holdings` in place (fills in a real
    # name for whatever still falls back to name==symbol — see prices.py)
    # and runs gathered alongside the price/FX fetches so it adds no extra
    # serial latency beyond whichever of the four is already slowest.
    crypto_prices, stock_prices, fx_rates, _ = await asyncio.gather(
        get_crypto_prices(crypto_ids),
        get_stock_prices(stock_syms),
        get_fx_rates(),
        backfill_holding_names(holdings),
    )
    eur_rate = fx_rates["EUR"]
    chf_rate = fx_rates["CHF"]
    brl_rate = fx_rates.get("BRL", 5.0)

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
        elif h["asset_type"] in EQUITY_TYPES:
            p = stock_prices.get(h["symbol"].upper(), {})
            price_usd = float(p.get("usd") or 0)
            change_24h = float(p.get("change_pct") or 0)
        elif h["asset_type"] == "cash":
            # Cash is valued at face value: 1 unit of symbol currency → USD
            cash_currency = h.get("currency") or h["symbol"].upper()
            price_usd = 1.0 / fx_rates.get(cash_currency, 1.0)
            change_24h = 0.0

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
            "price_brl": price_usd * brl_rate,
            "value_usd": value,
            "value_eur": value * eur_rate,
            "value_chf": value * chf_rate,
            "value_brl": value * brl_rate,
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

    return {
        "enriched": enriched,
        "total_usd": total_usd,
        "total_cost": total_cost,
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "total_daily_change": total_daily_change,
        "total_realized": total_realized,
        "eur_rate": eur_rate,
        "chf_rate": chf_rate,
        "brl_rate": brl_rate,
        "fx_rates": fx_rates,
    }


async def _save_snapshot(user_id: str, enriched: list, total_usd: float, total_pnl: float) -> None:
    """Saves a portfolio-value snapshot for the current 15-min bucket, with
    the same data-quality guards as before: skip if most assets came back
    unpriced (a flaky price fetch, not really "no value"), and skip if the
    total swings implausibly vs. the previous snapshot (almost certainly a
    bad price fetch, not a real >90% crash or >10x jump). Idempotent —
    upserts by (user_id, bucket_ts), so calling this more than once in the
    same 15-min window just overwrites with the latest figures. Shared by
    the live GET /portfolio endpoint and run_snapshot_scheduler below."""
    now = datetime.now(timezone.utc)
    bucket_minute = (now.minute // 15) * 15
    bucket = now.replace(minute=bucket_minute, second=0, microsecond=0)
    bucket_ts = bucket.isoformat()
    today = now.date().isoformat()

    wallet_values = {}
    wallet_costs = {}
    type_values = {}

    for e in enriched:
        wid = e.get("wallet_id")
        if not wid:
            continue
        wallet_values[wid] = wallet_values.get(wid, 0.0) + float(e.get("value_usd") or 0)
        wallet_costs[wid] = wallet_costs.get(wid, 0.0) + float(e.get("cost_usd") or 0)
        atype = e.get("asset_type", "other")
        type_values[atype] = type_values.get(atype, 0.0) + float(e.get("value_usd") or 0)

    wallet_pnls = {
        wid: wallet_values.get(wid, 0.0) - wallet_costs.get(wid, 0.0)
        for wid in wallet_values.keys()
    }

    valid_assets = [e for e in enriched if e.get("quantity", 0) > 0]

    priced_assets = [
        e for e in valid_assets
        if float(e.get("price_usd") or 0) > 0 and float(e.get("value_usd") or 0) > 0
    ]

    # Se existem ativos, mas mais de metade veio sem preço, não grava snapshot
    if valid_assets and len(priced_assets) < max(1, len(valid_assets) * 0.5):
        logger.warning(
            f"Skipping bad snapshot: priced_assets={len(priced_assets)} valid_assets={len(valid_assets)} total_usd={total_usd}"
        )
        return

    previous_snapshot = await db.snapshots.find_one(
        {"user_id": user_id, "bucket_ts": {"$lt": bucket_ts}},
        {"_id": 0},
        sort=[("bucket_ts", -1)],
    )

    should_save_snapshot = True

    if previous_snapshot:
        prev_total = float(previous_snapshot.get("total_usd") or 0)
        current_total = float(total_usd or 0)

        if prev_total > 0 and current_total > 0:
            if current_total < prev_total * 0.10:
                should_save_snapshot = False
                logger.warning(
                    f"Snapshot ignorado (queda anormal): {prev_total:.2f} -> {current_total:.2f}"
                )

            elif current_total > prev_total * 10:
                should_save_snapshot = False
                logger.warning(
                    f"Snapshot ignorado (subida anormal): {prev_total:.2f} -> {current_total:.2f}"
                )

    if not should_save_snapshot:
        return

    await db.snapshots.update_one(
        {"user_id": user_id, "bucket_ts": bucket_ts},
        {"$set": {
            "user_id": user_id,
            "bucket_ts": bucket_ts,
            "date": today,
            "total_usd": total_usd,
            "total_pnl_usd": total_pnl,
            "wallet_values": wallet_values,
            "wallet_pnls": wallet_pnls,
            "type_values": type_values,
            "timestamp": now.isoformat(),
        }},
        upsert=True,
    )


# How often run_snapshot_scheduler (see bottom of file) takes a snapshot for
# every user — kept in sync with the 15-min bucket size above.
SNAPSHOT_INTERVAL_SECONDS = 15 * 60


# Cap on simultaneous per-user snapshot jobs. Users' price lookups share the
# same per-symbol cache (prices.py), so running several in parallel mostly
# means only the first one per symbol actually hits CoinGecko/yfinance — but
# an unbounded asyncio.gather() over every user at once could still open too
# many concurrent outbound requests on Render's free tier, so it's capped
# with a semaphore rather than fully unbounded.
SNAPSHOT_CONCURRENCY = 8


async def _snapshot_one_user(uid: str, sem: "asyncio.Semaphore") -> None:
    async with sem:
        try:
            priced = await _price_holdings(uid)
            if priced["enriched"]:
                await _save_snapshot(uid, priced["enriched"], priced["total_usd"], priced["total_pnl"])
        except Exception as e:
            logger.warning(f"Snapshot scheduler: user {uid} failed: {e}")


async def run_snapshot_scheduler() -> None:
    """Background loop — call once from FastAPI startup (server.py), same
    pattern as alert_checker.run_alert_checker(). Without this, a portfolio
    snapshot is only ever created when a user happens to load the app
    (inside get_portfolio below), so anyone who isn't actively looking at
    the dashboard gets gaps — and the short intraday chart timeframes
    (15m/30m/1h/4h) end up with far fewer than N_BARS candles to show. This
    keeps snapshot history growing continuously for every user, regardless
    of whether the app is open.

    Users are snapshotted with bounded concurrency (SNAPSHOT_CONCURRENCY)
    rather than one at a time — with a sequential loop, total run time
    scaled linearly with user count and risked not finishing within the
    15-min bucket window as the user base grows; each user's work is
    I/O-bound (DB + price-API awaits), so running several at once is safe
    and each user's failure is still isolated (caught individually, doesn't
    affect the others)."""
    logger.info(f"Snapshot scheduler started (interval={SNAPSHOT_INTERVAL_SECONDS}s, concurrency={SNAPSHOT_CONCURRENCY})")
    while True:
        try:
            users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(10000)
            sem = asyncio.Semaphore(SNAPSHOT_CONCURRENCY)
            await asyncio.gather(*(
                _snapshot_one_user(u["id"], sem) for u in users if u.get("id")
            ))
        except Exception as e:
            logger.error(f"Snapshot scheduler loop error: {e}", exc_info=True)
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)


@router.get("/portfolio")
async def get_portfolio(user=Depends(get_current_user)):
    """Returns enriched holdings (from transactions) with live prices + summary."""
    await migrate_legacy_assets(user["id"])
    # Auto-detect and fix ETF/Fund asset types — run in background, never block portfolio load
    async def _fix_types_bg():
        try:
            await detect_and_fix_equity_types(user["id"])
        except Exception as e:
            logger.warning(f"fix_asset_types bg error: {e}")
    asyncio.create_task(_fix_types_bg())

    wallets = await db.wallets.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    priced = await _price_holdings(user["id"])
    enriched = priced["enriched"]
    total_usd = priced["total_usd"]
    total_cost = priced["total_cost"]
    total_pnl = priced["total_pnl"]
    total_pnl_pct = priced["total_pnl_pct"]
    total_daily_change = priced["total_daily_change"]
    total_realized = priced["total_realized"]
    eur_rate = priced["eur_rate"]
    chf_rate = priced["chf_rate"]
    brl_rate = priced["brl_rate"]
    fx_rates = priced["fx_rates"]

    await _save_snapshot(user["id"], enriched, total_usd, total_pnl)

    now = datetime.now(timezone.utc)

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
            "total_brl": total_usd * brl_rate,
            "total_cost_usd": total_cost,
            "total_pnl_usd": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "total_realized_pnl_usd": total_realized,
            "total_daily_change_usd": total_daily_change,
            "eur_rate": eur_rate,
            "chf_rate": chf_rate,
            "brl_rate": brl_rate,
            "fx_rates": fx_rates,
        },
        "triggered_alerts": triggered,
    }


@router.get("/prices/live")
async def get_live_prices(user=Depends(get_current_user)):
    """Overlay leve de preços em tempo real para o Dashboard (refresh a cada
    60s — ver Dashboard.jsx livePriceOverlayState), sem o enriquecimento
    completo do /portfolio (holdings, wallets, alertas) nem gravar snapshot.
    Cripto é só fallback aqui — o frontend já tem um WebSocket direto à
    Binance (useBinanceStream) como fonte principal; isto serve sobretudo
    para ações/ETFs/fundos/obrigações continuarem a "andar" entre os
    reloads completos de 5 em 5 minutos. Reutiliza get_crypto_prices/
    get_stock_prices, que já têm o seu próprio cache (60s/120s) — não
    dispara pedidos extra às APIs externas além do que /portfolio já usa."""
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    holdings = [h for h in compute_holdings_from_txns(txns) if h["quantity"] > 0]
    if not holdings:
        return {}

    crypto_ids = [
        h.get("coingecko_id") or h["symbol"].lower()
        for h in holdings
        if h["asset_type"] == "crypto"
    ]
    stock_syms = [
        h["symbol"] for h in holdings
        if h["asset_type"] in EQUITY_TYPES
    ]

    crypto_prices, stock_prices = await asyncio.gather(
        get_crypto_prices(crypto_ids),
        get_stock_prices(stock_syms),
    )

    out = {}
    for h in holdings:
        sym = h["symbol"].upper()
        if h["asset_type"] == "crypto":
            cg_id = h.get("coingecko_id") or h["symbol"].lower()
            price = (crypto_prices.get(cg_id) or {}).get("usd")
            if price:
                out[f"crypto:{sym}"] = {"price_usd": float(price)}
        elif h["asset_type"] in EQUITY_TYPES:
            price = (stock_prices.get(sym) or {}).get("usd")
            if price:
                out[f"stock:{sym}"] = {"price_usd": float(price)}

    return out


# N_BARS=70 rule (chartRanges.js): every range button means "up to 70
# candles of THAT SIZE", not "look back this literal unit". "1W" needs up to
# 70 *weeks* of raw daily data for the frontend to bucket into ~70 weekly
# candles — 7 days' worth (1 literal week) would only ever produce a single
# candle. Mirrors the equivalent `deltas` dict further down (the now-mostly-
# dead real-snapshot fallback), which already got this right.
_RETRO_N_BARS = 70
_RETRO_DAILY_DELTAS = {
    "1d": timedelta(days=1 * _RETRO_N_BARS),
    "1w": timedelta(weeks=1 * _RETRO_N_BARS),
    "1m": timedelta(days=30 * _RETRO_N_BARS),
    "1y": timedelta(days=365 * _RETRO_N_BARS),
}


def _trim_retro_result(result: list, range: str, now: datetime) -> list:
    """Trims a full (since-first-transaction) _build_retro_history result
    down to the requested window. No-op for "all"/unrecognised ranges."""
    delta = _RETRO_DAILY_DELTAS.get(range)
    if not delta:
        return result
    cutoff = (now - delta).date().isoformat()
    return [p for p in result if (p.get("ts") or p.get("date") or "") >= cutoff]


@router.get("/history")
async def get_history(range: str = "1w", wallet_id: str | None = None, asset_type: str | None = None, user=Depends(get_current_user)):
    """Portfolio history. 15m/30m/1h/4h reconstruct intraday from each held
    asset's own price history; every other range (1D/1W/1M/1Y/ALL, and any
    asset_type-filtered request) reconstructs daily from transactions."""
    now = datetime.now(timezone.utc)

    # 1D/1W/1M/1Y/ALL (and any asset_type filter) all reconstruct from
    # transactions instead of relying on real recorded snapshots. Real
    # snapshots only exist from whenever an account started being tracked —
    # a brand-new account (or one that just had its data reset) would
    # otherwise show a completely empty chart on 1W/1M/1Y for literal days/
    # weeks/months until enough real snapshots accumulated, even though the
    # transaction history to answer "what was this worth a week ago" is
    # already there. _build_retro_history is a single full walk since the
    # first transaction (same one "ALL" already used), cached 1h and shared
    # across all five of these ranges — 1D/1W/1M/1Y are just that same
    # result trimmed to a shorter window, essentially free after the first.
    if range in ("all", "1d", "1w", "1m", "1y") or (asset_type and asset_type != "all"):
        cache_key = f"history_all:{user['id']}:{wallet_id or 'global'}:{asset_type or 'all'}"
        cached = _cache_get(cache_key, ttl=3600)
        if cached:
            return _trim_retro_result(cached, range, now)

        result = await _build_retro_history(user["id"], wallet_id, asset_type)
        _cache_set(cache_key, result)
        return _trim_retro_result(result, range, now)

    # 15m/30m/1h/4h: reconstructed retroactively from each held asset's own
    # intraday price history (same source as the individual asset charts),
    # instead of only real snapshots — snapshots only exist from whenever
    # the account started being tracked (on-demand + the 15-min scheduler),
    # so a young account/wallet would otherwise show far fewer than N_BARS
    # candles here. Cached 15 min (matches the snapshot bucket size), so
    # this is only slow on the first load after the cache expires.
    if range in _INTRADAY_RETRO_RANGES:
        cache_key = f"history_intraday:{user['id']}:{wallet_id or 'global'}:{range}"
        cached = _cache_get(cache_key, ttl=900)
        if cached is not None:
            return cached
        try:
            result = await _build_retro_history_intraday(user["id"], range, wallet_id)
        except Exception as e:
            logger.error(f"intraday retro history failed (user={user['id']}, range={range}): {e}", exc_info=True)
            return []
        _cache_set(cache_key, result)
        return result

    # N_BARS mirrors backend/routes/news.py: every button means "candle
    # size", not "look back this long" — clicking "30m" shows the last 70
    # candles of 30-minute size, "1d" the last 70 *daily* candles, "1y" the
    # last 70 *yearly* candles, and so on, however far back that reaches (or
    # less, if there isn't 70 candles' worth of history yet). Snapshots are
    # bucketed every 15 min (see bucket_ts above); the frontend re-buckets
    # them into candles of the matching size (chartRanges.js
    # CHART_RANGE_BUCKET_MS).
    N_BARS = 70
    deltas = {
        "15m": timedelta(minutes=15 * N_BARS),
        "30m": timedelta(minutes=30 * N_BARS),
        "1h": timedelta(hours=1 * N_BARS),
        "4h": timedelta(hours=4 * N_BARS),
        "1d": timedelta(days=1 * N_BARS),
        "1w": timedelta(weeks=1 * N_BARS),
        "1m": timedelta(days=30 * N_BARS),
        "1y": timedelta(days=365 * N_BARS),
    }

    query = {"user_id": user["id"]}

    all_snaps = await db.snapshots.find(
        query,
        {"_id": 0}
    ).sort("bucket_ts", 1).to_list(5000)

    if range in deltas:
        cutoff = now - deltas[range]
        snaps = []

        for s in all_snaps:
            ts = s.get("bucket_ts") or s.get("timestamp") or s.get("date")
            if not ts:
                continue

            try:
                snap_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except Exception:
                continue

            if snap_dt >= cutoff:
                snaps.append(s)
    else:
        snaps = all_snaps

    result = []
    prev_total = None

    for s in snaps:
        if wallet_id and wallet_id != "all":
            total = (s.get("wallet_values") or {}).get(wallet_id, 0)
            pnl = (s.get("wallet_pnls") or {}).get(wallet_id, 0)
        else:
            total = s.get("total_usd", 0)
            pnl = s.get("total_pnl_usd", 0)

        total = float(total or 0)

        if total <= 0:
            continue

        # Segunda linha de defesa contra o mesmo tipo de outlier que
        # _save_snapshot já tenta prevenir na escrita (queda/subida >10x vs.
        # o snapshot anterior): protege contra snapshots antigos, gravados
        # antes de essas guardas existirem, que ainda estejam na base de
        # dados e que produziam um candle gigante e falso no gráfico.
        if prev_total is not None and prev_total > 0:
            if total < prev_total * 0.10 or total > prev_total * 10:
                continue

        prev_total = total

        result.append({
            "ts": s.get("bucket_ts") or s.get("date"),
            "date": s.get("date"),
            "total_usd": total,
            "total_pnl_usd": pnl,
            "source": "snapshot",
        })

    return result

@router.post("/history/backfill-types")
async def backfill_type_values(user=Depends(get_current_user)):
    """Retroactively fill type_values in existing snapshots using reconstructed daily prices."""
    import pandas as pd

    user_id = user["id"]
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    if not txns:
        return {"updated": 0}

    txns.sort(key=lambda t: t.get("date", ""))

    # Gather all unique (asset_type, symbol) pairs
    assets = {}
    for t in txns:
        key = (t["asset_type"], t["symbol"].upper())
        assets.setdefault(key, {"asset_type": t["asset_type"], "symbol": t["symbol"].upper()})

    def _fetch_closes(asset_type: str, symbol: str):
        ck = f"retro_closes:{asset_type}:{symbol}"
        cached = _cache_get(ck, ttl=3600)
        if cached is not None:
            return cached
        yf_sym = f"{symbol}-USD" if asset_type == "crypto" else symbol
        try:
            hist = yf.Ticker(yf_sym).history(period="max", interval="1d")
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
            logger.warning(f"backfill closes {yf_sym}: {e}")
            _cache_set(ck, {})
            return {}

    keys = list(assets.keys())
    closes_per_asset = await asyncio.gather(*[
        asyncio.to_thread(_fetch_closes, k[0], k[1]) for k in keys
    ])
    closes_map = {k: c for k, c in zip(keys, closes_per_asset)}

    # Build qty state per day from transactions
    txns_by_day = {}
    for t in txns:
        day = t.get("date", "")[:10]
        txns_by_day.setdefault(day, []).append(t)

    # Get all snapshot dates for this user
    snaps = await db.snapshots.find({"user_id": user_id}, {"_id": 0, "bucket_ts": 1, "date": 1}).to_list(5000)
    snap_dates = sorted({(s.get("date") or (s.get("bucket_ts") or "")[:10]) for s in snaps if s.get("date") or s.get("bucket_ts")})

    if not snap_dates:
        return {"updated": 0}

    first_date = txns[0].get("date", "")[:10]
    try:
        cur = datetime.fromisoformat(first_date).date()
    except (TypeError, ValueError):
        return {"updated": 0}
    end_date = datetime.now(timezone.utc).date()

    # Walk day by day, track quantities, record type_values on snapshot dates
    qty = {k: 0.0 for k in keys}
    cost = {k: 0.0 for k in keys}
    last_price = {k: 0.0 for k in keys}
    snap_date_set = set(snap_dates)
    daily_type_values: dict[str, dict[str, float]] = {}  # date -> {type: value}

    while cur <= end_date:
        day_iso = cur.isoformat()
        for t in txns_by_day.get(day_iso, []):
            key = (t["asset_type"], t["symbol"].upper())
            fx = float(t.get("fx_to_usd") or 1.0)
            q = float(t["quantity"])
            p_usd = float(t["price"]) * fx
            if t["type"] == "BUY":
                qty[key] += q
                cost[key] += q * p_usd
            else:
                sell_q = min(q, qty[key])
                if qty[key] > 0:
                    avg = cost[key] / qty[key]
                    cost[key] -= avg * sell_q
                qty[key] -= sell_q
                if qty[key] < 1e-9:
                    qty[key] = 0; cost[key] = 0

        if day_iso in snap_date_set:
            type_vals: dict[str, float] = {}
            for k in keys:
                if qty[k] <= 0:
                    continue
                series = closes_map.get(k, {})
                price = series.get(day_iso)
                if price is None:
                    price = last_price[k]
                else:
                    last_price[k] = price
                atype = k[0]
                type_vals[atype] = type_vals.get(atype, 0.0) + qty[k] * (price or 0)
            if type_vals:
                daily_type_values[day_iso] = type_vals

        # Update last_price for all assets even on non-snap days
        for k in keys:
            series = closes_map.get(k, {})
            if day_iso in series:
                last_price[k] = series[day_iso]

        cur += timedelta(days=1)

    # Update snapshots in DB
    updated = 0
    for s in snaps:
        snap_date = (s.get("date") or (s.get("bucket_ts") or "")[:10])
        tv = daily_type_values.get(snap_date)
        if tv:
            bucket_ts = s.get("bucket_ts")
            if bucket_ts:
                await db.snapshots.update_one(
                    {"user_id": user_id, "bucket_ts": bucket_ts},
                    {"$set": {"type_values": tv}}
                )
                updated += 1

    return {"updated": updated, "snap_dates": len(snap_dates)}


async def _build_retro_history(user_id: str, wallet_id: str | None = None, asset_type: str | None = None):
    """Reconstrói o histórico ALL desde a primeira transação."""
    import pandas as pd

    query = {"user_id": user_id}

    if wallet_id and wallet_id != "all":
        query["wallet_id"] = wallet_id

    if asset_type and asset_type != "all":
        query["asset_type"] = asset_type

    txns = await db.transactions.find(query, {"_id": 0}).to_list(5000)

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

    assets = {}

    for t in txns:
        key = (t["asset_type"], t["symbol"].upper())
        assets.setdefault(key, {
            "asset_type": t["asset_type"],
            "symbol": t["symbol"].upper(),
        })

    def _fetch_closes(asset_type: str, symbol: str):
        ck = f"retro_closes:{asset_type}:{symbol}"
        cached = _cache_get(ck, ttl=3600)

        if cached is not None:
            return cached

        yf_sym = f"{symbol}-USD" if asset_type == "crypto" else symbol

        try:
            ticker = yf.Ticker(yf_sym)
            hist = ticker.history(period="max", interval="1d")

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

    # Diagnóstico (queixa: "ALL fica super lento") — mede as duas fases que
    # podem custar tempo: o fetch yfinance "period=max" por ativo (rede,
    # só lento a frio — depois fica em cache 1h) e a caminhada dia a dia
    # (CPU pura; só seria lenta se `start` viesse de uma data de transação
    # corrompida/absurdamente antiga, fazendo `days` explodir).
    t0 = time.monotonic()
    closes_per_asset = await asyncio.gather(*[
        asyncio.to_thread(_fetch_closes, k[0], k[1]) for k in keys
    ])
    fetch_elapsed = time.monotonic() - t0

    closes_map = {k: c for k, c in zip(keys, closes_per_asset)}

    days = []
    cur = start

    while cur <= end:
        days.append(cur)
        cur += timedelta(days=1)

    logger.info(
        f"retro ALL user={user_id}: {len(keys)} ativo(s), {len(days)} dia(s) "
        f"({start.isoformat()} -> {end.isoformat()}), fetch yfinance levou {fetch_elapsed:.2f}s"
    )
    t1 = time.monotonic()

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

        for t in txns_by_day.get(day_iso, []):
            key = (t["asset_type"], t["symbol"].upper())
            fx = float(t.get("fx_to_usd") or 1.0)
            q = float(t["quantity"])
            p_usd = float(t["price"]) * fx

            if t["type"] == "BUY":
                qty[key] += q
                cost[key] += q * p_usd + float(t.get("fee", 0)) * fx
            else:
                sell_q = min(q, qty[key])

                if qty[key] > 0:
                    avg = cost[key] / qty[key]
                    cost[key] -= avg * sell_q

                qty[key] -= sell_q

                if qty[key] < 1e-9:
                    qty[key] = 0
                    cost[key] = 0

        total_v = 0.0
        # Retorno por categoria no gráfico de Evolução (7 jul 2026) — soma
        # aditiva ao lado do total já existente, não muda total_v/total_cost
        # nem nenhuma das regras de rede de segurança/outliers documentadas
        # na REGRA #2 do CLAUDE.md. Cada ponto passa a trazer também
        # "by_class": {asset_type: valor_usd}, para o frontend desenhar uma
        # linha por categoria além da linha total.
        by_class: dict[str, float] = {}

        for k in keys:
            if qty[k] <= 0:
                continue

            series = closes_map.get(k, {})
            price = series.get(day_iso)

            if price is None:
                price = last_price[k]
            else:
                last_price[k] = price

            contrib = qty[k] * (price or 0)
            total_v += contrib
            by_class[k[0]] = by_class.get(k[0], 0.0) + contrib

        total_cost = sum(cost.values())

        if total_v <= 0:
            continue

        result.append({
            "ts": day_iso,
            "date": day_iso,
            "total_usd": total_v,
            "total_pnl_usd": total_v - total_cost,
            "source": "reconstructed",
            "by_class": {c: round(v, 2) for c, v in by_class.items()},
        })

    walk_elapsed = time.monotonic() - t1
    logger.info(
        f"retro ALL user={user_id}: caminhada dia-a-dia levou {walk_elapsed:.2f}s, "
        f"{len(result)} ponto(s) no resultado final"
    )

    return result


def _drop_price_spikes(points: list) -> list:
    """Remove candles isolados cujo preço destoa brutalmente dos vizinhos
    (>5x acima ou <20% abaixo de AMBOS o ponto anterior e o seguinte) —
    fontes gratuitas (CoinGecko/Yahoo) devolvem ocasionalmente um candle com
    dados maus (glitch, preço a 0 ou fora de escala). Isto sozinho já
    distorceria um gráfico de ativo, mas na carteira é pior: como o preço
    é usado em carry-forward, um único candle mau contamina TODOS os pontos
    seguintes da reconstrução até ao próximo preço válido. `points` é uma
    lista (t, close) já ordenada por tempo."""
    if len(points) < 3:
        return points
    cleaned = [points[0]]
    for i in range(1, len(points) - 1):
        prev_c = cleaned[-1][1]
        cur_c = points[i][1]
        next_c = points[i + 1][1]
        if prev_c > 0 and next_c > 0 and cur_c > 0:
            spike_vs_prev = cur_c > prev_c * 5 or cur_c < prev_c * 0.2
            spike_vs_next = cur_c > next_c * 5 or cur_c < next_c * 0.2
            if spike_vs_prev and spike_vs_next:
                continue  # ponto isolado implausível — descarta
        cleaned.append(points[i])
    cleaned.append(points[-1])
    return cleaned


async def _fetch_asset_intraday_series(asset_type: str, symbol: str, coingecko_id: str, range_key: str) -> list:
    """Série OHLC intraday de um ativo, para reconstrução retroativa do
    histórico da carteira — reutiliza exatamente a mesma fonte/lógica do
    gráfico de ativo individual (routes/news.py: _fetch_yf / _fetch_crypto_ohlc).
    Cache de 15 min (mesmo tamanho do bucket dos snapshots)."""
    ck = f"retro_intraday:{asset_type}:{symbol}:{coingecko_id}:{range_key}"
    cached = _cache_get(ck, ttl=900)
    if cached is not None:
        return cached

    if asset_type == "crypto":
        cg = coingecko_id or symbol.lower()
        yf_sym = f"{symbol}-USD"
        if range_key in ("15m", "30m", "1h"):
            # Mesmo bug do gráfico de ativo individual (ver news.py
            # asset_history): o CoinGecko não tem granularidade real de
            # 15m/30m/1h — escolhe o tamanho do candle só pelo `days`, e
            # 15m/30m/1h mapeiam todos para days=1, que devolve sempre
            # candles de 30 min. Como "funciona" (não fica vazio), o
            # fallback para Yahoo nunca chegava a disparar, e os três
            # tempos contribuíam com o preço exatamente igual para a
            # reconstrução da carteira. yfinance tem intervalos nativos
            # 15m/30m/60m reais para tickers cripto — usar primeiro aqui.
            pts = await asyncio.to_thread(_fetch_yf, yf_sym, range_key)
            if not pts:
                pts = await _fetch_crypto_ohlc(cg, range_key)
        else:
            pts = await _fetch_crypto_ohlc(cg, range_key)
            # CoinGecko free tier tem rate-limit apertado (429) — fácil de
            # atingir quando há vários ativos cripto e/ou vários tempos
            # pedidos em pouco tempo. Duas tentativas extra com espera
            # crescente antes de cair para o Yahoo, já que um 429 costuma
            # resolver-se sozinho em poucos segundos.
            for backoff in (1.0, 3.0):
                if pts:
                    break
                await asyncio.sleep(backoff)
                pts = await _fetch_crypto_ohlc(cg, range_key)
            if not pts:
                pts = await asyncio.to_thread(_fetch_yf, yf_sym, range_key)
    else:
        pts = await asyncio.to_thread(_fetch_yf, symbol, range_key)

    if not pts:
        logger.warning(f"intraday retro: sem dados para {asset_type}:{symbol} range={range_key} (CoinGecko/Yahoo ambos vazios)")

    _cache_set(ck, pts)
    return pts


async def _build_retro_history_intraday(user_id: str, range_key: str, wallet_id: str | None = None):
    """Reconstrói o histórico intraday (15m/30m/1h/4h) da carteira a partir
    do histórico de preços de cada ativo detido (mesma fonte dos gráficos de
    ativo individuais), em vez de depender só de snapshots reais — que só
    existem desde que a conta começou a ser seguida (ver run_snapshot_scheduler).

    Espelha a lógica de _build_retro_history (transações -> qty/cost por
    ativo), mas em vez de uma caminhada dia a dia usa como timeline a união
    dos timestamps intraday devolvidos pela série de cada ativo, indo buscar
    o preço mais recente conhecido (carry-forward) em cada timestamp.

    Cash não é precificado (mesma limitação pré-existente de
    _build_retro_history — não há ticker yfinance para símbolos de moeda)."""
    query = {"user_id": user_id}
    if wallet_id and wallet_id != "all":
        query["wallet_id"] = wallet_id

    txns = await db.transactions.find(query, {"_id": 0}).to_list(5000)
    if not txns:
        return []

    txns.sort(key=lambda t: t.get("date", ""))

    assets = {}
    for t in txns:
        key = (t["asset_type"], t["symbol"].upper())
        assets.setdefault(key, {
            "asset_type": t["asset_type"],
            "symbol": t["symbol"].upper(),
            "coingecko_id": t.get("coingecko_id") or "",
        })

    keys = list(assets.keys())
    series_per_asset = await asyncio.gather(*[
        _fetch_asset_intraday_series(
            assets[k]["asset_type"], assets[k]["symbol"], assets[k]["coingecko_id"], range_key
        ) for k in keys
    ])
    series_map = {k: s for k, s in zip(keys, series_per_asset)}

    # Diagnóstico: fica no log do backend sempre que isto corre, para se
    # voltar a aparecer um gráfico vazio/escasso dar para ver logo aqui
    # quantos ativos tinham série vazia, em vez de adivinhar às cegas.
    empty_assets = [f"{k[0]}:{k[1]}" for k in keys if not series_map.get(k)]
    counts = {f"{k[0]}:{k[1]}": len(series_map.get(k) or []) for k in keys}
    logger.info(
        f"intraday retro user={user_id} range={range_key}: {len(keys)} ativo(s), "
        f"{len(empty_assets)} sem série ({empty_assets}), pontos por ativo: {counts}"
    )

    # União ordenada de todos os timestamps (ms) de qualquer ativo detido —
    # esta é a timeline da carteira, tal como `days` é a timeline no reconstrutor diário.
    # IMPORTANTE: ao contrário dos gráficos de ativo (que recebem candles OHLC
    # já prontos do Yahoo/CoinGecko), aqui não há OHLC nativo do "valor da
    # carteira" — tem de ser sintetizado a partir de amostras pontuais. Por
    # isso NÃO se corta esta união a N_BARS aqui: manter todos os pontos
    # brutos disponíveis (cada ativo já vem limitado a ~70 pelo news.py, por
    # isso isto nunca explode) para o Dashboard.jsx os conseguir agrupar em
    # candles OHLC com variação real (bucketOHLC + slice a N_BARS no fim) —
    # exatamente o mesmo padrão já usado com sucesso no caminho antigo de
    # snapshots (1D/1W/1M/1Y). Cortar aqui antes de agrupar achatava os
    # candles a barras finas (open=high=low=close).
    # NOTA: propositadamente NÃO se retorna já aqui se `all_ts` vier vazio
    # (ex.: Yahoo/CoinGecko ambos em baixo/rate-limited neste momento para
    # todos os ativos detidos) — isso saltava logo por cima da rede de
    # segurança mais abaixo, precisamente no pior cenário em que ela era
    # mais precisa. O loop principal simplesmente não corre se `all_ts`
    # estiver vazio, `result` fica `[]`, e a rede de segurança entra em ação.
    all_ts = sorted({p["t"] for s in series_map.values() for p in s})

    # Por ativo: lista (t, close) ordenada, para andar um ponteiro em frente
    # e ir buscar o último preço conhecido <= cada timestamp da timeline.
    price_index = {
        k: _drop_price_spikes(sorted(((p["t"], p["c"]) for p in s), key=lambda x: x[0]))
        for k, s in series_map.items()
    }

    txns_by_ts = {}
    for t in txns:
        try:
            dt = datetime.fromisoformat((t.get("date") or "").replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError, AttributeError):
            continue
        txns_by_ts.setdefault(int(dt.timestamp() * 1000), []).append(t)

    txn_ts_sorted = sorted(txns_by_ts.keys())

    qty = {k: 0.0 for k in keys}
    cost = {k: 0.0 for k in keys}
    # Semear com o primeiro preço conhecido de cada ativo (não com 0): a
    # timeline combinada de vários ativos raramente começa exatamente no
    # mesmo instante para todos — um ativo cujos próprios pontos só
    # aparecem mais tarde na união ficaria a contribuir com preço 0 até
    # "apanhar" a sua série, fazendo o valor total da carteira parecer
    # despencar a zero e depois recuperar (o "-100%" visto no BTC). Usar o
    # preço mais antigo que temos para esse ativo evita esse salto falso.
    last_price = {k: (price_index[k][0][1] if price_index.get(k) else 0.0) for k in keys}
    idx_ptr = {k: 0 for k in keys}
    txn_ptr = 0

    result = []

    for t_ms in all_ts:
        # Aplica todas as transações com data <= t_ms ainda não aplicadas.
        while txn_ptr < len(txn_ts_sorted) and txn_ts_sorted[txn_ptr] <= t_ms:
            for t in txns_by_ts[txn_ts_sorted[txn_ptr]]:
                key = (t["asset_type"], t["symbol"].upper())
                fx = float(t.get("fx_to_usd") or 1.0)
                q = float(t["quantity"])
                p_usd = float(t["price"]) * fx

                if t["type"] == "BUY":
                    qty[key] += q
                    cost[key] += q * p_usd + float(t.get("fee", 0)) * fx
                else:
                    sell_q = min(q, qty[key])
                    if qty[key] > 0:
                        avg = cost[key] / qty[key]
                        cost[key] -= avg * sell_q
                    qty[key] -= sell_q
                    if qty[key] < 1e-9:
                        qty[key] = 0
                        cost[key] = 0
            txn_ptr += 1

        total_v = 0.0
        # Ver comentário equivalente em _build_retro_history — mesma soma
        # aditiva por categoria, sem tocar em total_v/rede de segurança.
        by_class: dict[str, float] = {}
        for k in keys:
            if qty[k] <= 0:
                continue
            series = price_index.get(k, [])
            p = idx_ptr[k]
            while p < len(series) and series[p][0] <= t_ms:
                last_price[k] = series[p][1]
                p += 1
            idx_ptr[k] = p
            contrib = qty[k] * (last_price[k] or 0)
            total_v += contrib
            by_class[k[0]] = by_class.get(k[0], 0.0) + contrib

        total_cost = sum(cost.values())
        if total_v <= 0:
            continue

        ts_iso = datetime.fromtimestamp(t_ms / 1000, tz=timezone.utc).isoformat()
        result.append({
            "ts": ts_iso,
            "date": ts_iso[:10],
            "total_usd": total_v,
            "total_pnl_usd": total_v - total_cost,
            "source": "reconstructed",
            "by_class": {c: round(v, 2) for c, v in by_class.items()},
        })

    logger.info(
        f"intraday retro user={user_id} range={range_key}: união de {len(all_ts)} timestamp(s), "
        f"{len(result)} ponto(s) com total_v > 0 no resultado final"
    )

    # Rede de segurança: se a reconstrução ficou escassa (ex.: CoinGecko
    # e/ou Yahoo momentaneamente indisponíveis para algum ativo), junta os
    # snapshots reais já gravados (get_portfolio + run_snapshot_scheduler)
    # na mesma janela, para o gráfico não ficar vazio só por causa de uma
    # falha temporária de uma fonte externa de preços.
    if len(result) < 5:
        logger.info(f"intraday retro user={user_id} range={range_key}: só {len(result)} ponto(s), a juntar snapshots reais como rede de segurança")
        N_BARS = _RETRO_N_BARS  # single source of truth, see _RETRO_N_BARS above
        window_deltas = {
            "15m": timedelta(minutes=15 * N_BARS),
            "30m": timedelta(minutes=30 * N_BARS),
            "1h": timedelta(hours=1 * N_BARS),
            "4h": timedelta(hours=4 * N_BARS),
        }
        cutoff = datetime.now(timezone.utc) - window_deltas.get(range_key, timedelta(days=3))

        real_snaps = await db.snapshots.find({"user_id": user_id}, {"_id": 0}).sort("bucket_ts", 1).to_list(2000)
        existing_ts = {p["ts"] for p in result}
        # Continua a partir do último valor já reconstruído (se houver),
        # para o primeiro snapshot juntado também ser verificado contra ele
        # — sem isto, um outlier logo no primeiro snapshot passava sempre.
        prev_total = result[-1]["total_usd"] if result else None

        for s in real_snaps:
            ts = s.get("bucket_ts") or s.get("date")
            if not ts or ts in existing_ts:
                continue
            try:
                snap_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                continue
            if snap_dt < cutoff:
                continue

            if wallet_id and wallet_id != "all":
                total = float((s.get("wallet_values") or {}).get(wallet_id, 0) or 0)
                pnl = float((s.get("wallet_pnls") or {}).get(wallet_id, 0) or 0)
            else:
                total = float(s.get("total_usd", 0) or 0)
                pnl = float(s.get("total_pnl_usd", 0) or 0)

            if total <= 0:
                continue
            # Mesma guarda contra outliers usada no caminho antigo de snapshots.
            if prev_total is not None and prev_total > 0 and (total < prev_total * 0.10 or total > prev_total * 10):
                continue
            prev_total = total

            result.append({"ts": ts, "date": s.get("date"), "total_usd": total, "total_pnl_usd": pnl, "source": "safety_net"})

        result.sort(key=lambda p: p["ts"])

    return result


@router.get("/sparklines")
async def get_sparklines(user=Depends(get_current_user)):
    """Returns ~24h price series for each held asset via yfinance (same source as wallet sparklines)."""
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    holdings = [h for h in compute_holdings_from_txns(txns) if h["quantity"] > 0]
    if not holdings:
        return {}

    def _fetch_asset_spark(asset_type: str, symbol: str) -> list | None:
        yf_sym = f"{symbol}-USD" if asset_type == "crypto" else symbol
        cache_key = f"spark24:{asset_type}:{symbol}"
        cached = _cache_get(cache_key, ttl=900)
        if cached:
            return cached
        try:
            hist = yf.Ticker(yf_sym).history(period="2d", interval="1h")
            if hist.empty:
                hist = yf.Ticker(yf_sym).history(period="7d", interval="1d")
            if hist.empty:
                return None
            pts = [{"t": int(ts.timestamp() * 1000), "p": round(float(row["Close"]), 6)}
                   for ts, row in hist.iterrows() if row["Close"] > 0]
            if len(pts) >= 2:
                _cache_set(cache_key, pts)
                return pts
        except Exception as e:
            logger.warning(f"sparkline {yf_sym} err: {e}")
        return None

    tasks = [
        asyncio.to_thread(_fetch_asset_spark, h["asset_type"], h["symbol"].upper())
        for h in holdings
    ]
    keys = [f"{h['asset_type']}:{h['symbol'].upper()}" for h in holdings]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = {}
    for key, res in zip(keys, results):
        if isinstance(res, list) and len(res) >= 2:
            out[key] = res
    return out





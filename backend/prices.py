"""Price fetching helpers (CoinGecko, yfinance, FX) and holding computation."""
import asyncio
import re as _re
from typing import List

import httpx
import yfinance as yf

from core import _cache_get, _cache_set, logger, db


# --- Crypto prices ---
async def get_crypto_prices(coingecko_ids: List[str]) -> dict:
    """Returns dict { coingecko_id: { usd, eur, usd_24h_change, eur_24h_change } }"""
    if not coingecko_ids:
        return {}
    ids_str = ",".join(sorted(set(coingecko_ids)))
    cache_key = f"crypto:{ids_str}"
    cached = _cache_get(cache_key, ttl=60)
    if cached:
        return cached
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ids_str,
        "vs_currencies": "usd,eur",
        "include_24hr_change": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            _cache_set(cache_key, data)
            return data
    except Exception as e:
        logger.error(f"CoinGecko error: {e}")
        return {}


# --- Stock prices (yfinance) ---
def _yf_fetch(symbols: List[str]) -> dict:
    """Sync yfinance fetch (run in thread). Returns { symbol: { usd, prev_close, change_pct } }"""
    out = {}
    if not symbols:
        return out
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = tickers.tickers.get(sym) or yf.Ticker(sym)
                fast = getattr(t, "fast_info", None) or {}
                price = None
                prev = None
                try:
                    price = float(fast.get("last_price") or fast.get("lastPrice") or 0) or None
                    prev = float(fast.get("previous_close") or fast.get("previousClose") or 0) or None
                except Exception:
                    pass
                if not price:
                    hist = t.history(period="2d")
                    if not hist.empty:
                        price = float(hist["Close"].iloc[-1])
                        if len(hist) >= 2:
                            prev = float(hist["Close"].iloc[-2])
                if price:
                    change_pct = ((price - prev) / prev * 100) if prev else 0
                    out[sym] = {"usd": price, "prev_close": prev or price, "change_pct": change_pct}
            except Exception as e:
                logger.warning(f"yfinance {sym} error: {e}")
    except Exception as e:
        logger.error(f"yfinance batch error: {e}")
    return out


async def get_stock_prices(symbols: List[str]) -> dict:
    if not symbols:
        return {}
    syms = sorted(set([s.upper() for s in symbols]))
    cache_key = f"stocks:{','.join(syms)}"
    cached = _cache_get(cache_key, ttl=120)
    if cached:
        return cached
    data = await asyncio.to_thread(_yf_fetch, syms)

    # Resolve unknown symbols via Yahoo Search
    unresolved = [s for s in syms if s not in data or not data[s].get("usd")]
    if unresolved:
        def _variants(s: str):
            cleaned = _re.sub(r"[^a-zA-Z0-9]", "", s).lower()
            yield s
            if cleaned and cleaned != s.lower():
                yield cleaned
            m = _re.match(r"^3d(.+)$", cleaned)
            if m:
                yield f"{m.group(1)} 3d"
                yield f"{m.group(1)}3d"
            m = _re.match(r"^(.+)3d$", cleaned)
            if m:
                yield f"3d{m.group(1)}"
                yield f"3d {m.group(1)}"

        async def _resolve(sym: str):
            cache_key_r = f"resolve:{sym.lower()}"
            cached_r = _cache_get(cache_key_r, ttl=86400)
            if cached_r is not None:
                return sym, cached_r or None
            for term in _variants(sym):
                try:
                    async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as ch:
                        r = await ch.get(
                            "https://query2.finance.yahoo.com/v1/finance/search",
                            params={"q": term, "quotesCount": 5, "newsCount": 0},
                        )
                        if r.status_code != 200:
                            continue
                        for q in r.json().get("quotes", []):
                            qt = (q.get("quoteType") or "").upper()
                            if qt in ("EQUITY", "ETF") and q.get("symbol"):
                                resolved = q["symbol"]
                                _cache_set(cache_key_r, resolved)
                                return sym, resolved
                except Exception as e:
                    logger.warning(f"resolve {sym}/{term} err: {e}")
            _cache_set(cache_key_r, "")
            return sym, None

        resolutions = await asyncio.gather(*[_resolve(s) for s in unresolved])
        resolved_pairs = [(o, r) for o, r in resolutions if r and r != o]
        if resolved_pairs:
            new_syms = [r for _, r in resolved_pairs]
            resolved_data = await asyncio.to_thread(_yf_fetch, new_syms)
            for orig, real in resolved_pairs:
                if real in resolved_data and resolved_data[real].get("usd"):
                    data[orig] = resolved_data[real]
    _cache_set(cache_key, data)
    return data


# --- FX rates ---
async def get_fx_rates() -> dict:
    """Returns { 'USD': 1.0, 'EUR': eur_per_usd, 'CHF': chf_per_usd }."""
    cached = _cache_get("fx:rates", ttl=600)
    if cached:
        return cached
    rates = {"USD": 1.0, "EUR": 0.92, "CHF": 0.88}
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json().get("rates", {})
                for c in ("EUR", "CHF"):
                    if data.get(c):
                        rates[c] = float(data[c])
    except Exception as e:
        logger.warning(f"FX rate fetch failed, using defaults: {e}")
    _cache_set("fx:rates", rates)
    return rates


async def get_eur_usd_rate() -> float:
    rates = await get_fx_rates()
    return rates.get("EUR", 0.92)


# --- Holdings ---
def compute_holdings_from_txns(txns: List[dict]) -> List[dict]:
    """Compute current holdings from a list of transactions (weighted average cost)."""
    txns = sorted(txns, key=lambda t: (t.get("date", ""), t.get("created_at", "")))
    holdings = {}
    for t in txns:
        key = (t["wallet_id"], t["asset_type"], t["symbol"].upper())
        h = holdings.get(key)
        if not h:
            h = {
                "wallet_id": t["wallet_id"],
                "asset_type": t["asset_type"],
                "symbol": t["symbol"].upper(),
                "coingecko_id": t.get("coingecko_id"),
                "name": t.get("name") or t["symbol"],
                "quantity": 0.0,
                "total_cost_usd": 0.0,
                "avg_cost_usd": 0.0,
                "realized_pnl_usd": 0.0,
                "tx_count": 0,
            }
            holdings[key] = h
        if t.get("coingecko_id"):
            h["coingecko_id"] = t["coingecko_id"]
        if t.get("name"):
            h["name"] = t["name"]
        h["tx_count"] += 1

        fx = float(t.get("fx_to_usd") or 1.0)
        price_usd = float(t["price"]) * fx
        fee_usd = float(t.get("fee", 0)) * fx
        qty = float(t["quantity"])

        if t["type"] == "BUY":
            h["total_cost_usd"] += price_usd * qty + fee_usd
            h["quantity"] += qty
            if h["quantity"] > 0:
                h["avg_cost_usd"] = h["total_cost_usd"] / h["quantity"]
        elif t["type"] == "SELL":
            sell_qty = min(qty, h["quantity"])
            realized = (price_usd - h["avg_cost_usd"]) * sell_qty - fee_usd
            h["realized_pnl_usd"] += realized
            cost_removed = h["avg_cost_usd"] * sell_qty
            h["total_cost_usd"] -= cost_removed
            h["quantity"] -= sell_qty
            if h["quantity"] < 1e-9:
                h["quantity"] = 0
                h["total_cost_usd"] = 0
    return list(holdings.values())


async def migrate_legacy_assets(user_id: str):
    """One-time migration: convert legacy `assets` rows into BUY transactions."""
    import uuid
    from datetime import datetime, timezone
    legacy = await db.assets.find({"user_id": user_id}).to_list(2000)
    if not legacy:
        return
    fx_rates = await get_fx_rates()  # noqa: F841 (kept for parity)
    for a in legacy:
        date = (a.get("created_at") or datetime.now(timezone.utc).isoformat())[:10]
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet_id": a["wallet_id"],
            "asset_type": a["asset_type"],
            "symbol": a["symbol"].upper(),
            "coingecko_id": a.get("coingecko_id"),
            "name": a.get("name") or a["symbol"],
            "type": "BUY",
            "date": date,
            "quantity": a["quantity"],
            "price": a["avg_price"],
            "fee": 0,
            "currency": "USD",
            "fx_to_usd": 1.0,
            "notes": "Migrated from initial holdings",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_migrated": True,
        })
    await db.assets.delete_many({"user_id": user_id})
    logger.info(f"Migrated {len(legacy)} legacy assets to transactions for user {user_id}")

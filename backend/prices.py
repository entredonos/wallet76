"""Price fetching helpers (CoinGecko, yfinance, FX) and holding computation."""
import asyncio
import re as _re
from typing import List

import httpx
import yfinance as yf

from core import _cache_get, _cache_set, logger, db


# --- Crypto prices ---
async def get_crypto_prices(coingecko_ids: List[str]) -> dict:
    """Returns dict { coingecko_id: { usd, eur, usd_24h_change, eur_24h_change } }.

    Cached PER SYMBOL (not per combined request), and shared across every
    user — not scoped to a single user's request. The old version cached by
    the exact joined id-list ("crypto:bitcoin,ethereum"), so two users with
    almost-identical holdings (both own BTC/ETH, one also owns SOL) each
    triggered their own separate CoinGecko call for the SAME BTC/ETH prices
    within the same 60s window, instead of the second user's request
    reusing what the first one just fetched. Now each id has its own cache
    entry, so only the ids NOT already cached actually hit CoinGecko."""
    if not coingecko_ids:
        return {}
    ids = sorted(set(coingecko_ids))

    result = {}
    missing = []
    for cid in ids:
        cached = _cache_get(f"crypto_price:{cid}", ttl=60)
        if cached is not None:
            result[cid] = cached
        else:
            missing.append(cid)

    if not missing:
        return result

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(missing),
        "vs_currencies": "usd,eur",
        "include_24hr_change": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            for cid, val in data.items():
                _cache_set(f"crypto_price:{cid}", val)
                result[cid] = val
    except Exception as e:
        logger.error(f"CoinGecko error: {e}")
    return result


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
    """Same shared per-symbol caching as get_crypto_prices above — each
    symbol has its own cache entry so a second user requesting a stock
    already fetched (for anyone) in the last 120s reuses it instead of
    triggering another yfinance batch call for it. Still batches whatever's
    actually missing into a single yfinance call (batching per request is
    still cheaper than one call per symbol when there IS a real cache miss)."""
    if not symbols:
        return {}
    syms = sorted(set([s.upper() for s in symbols]))

    result = {}
    missing = []
    for sym in syms:
        cached = _cache_get(f"stock_price:{sym}", ttl=120)
        if cached is not None:
            result[sym] = cached
        else:
            missing.append(sym)

    if not missing:
        return result

    data = await asyncio.to_thread(_yf_fetch, missing)
    for sym, val in data.items():
        _cache_set(f"stock_price:{sym}", val)
    result.update(data)

    # Resolve unknown symbols via Yahoo Search
    unresolved = [s for s in missing if s not in result or not result[s].get("usd")]
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
                    result[orig] = resolved_data[real]
                    _cache_set(f"stock_price:{orig}", resolved_data[real])
    return result


# --- FX rates ---
async def get_fx_rates() -> dict:
    """Returns { 'USD': 1.0, 'EUR': eur_per_usd, 'CHF': chf_per_usd, 'BRL': brl_per_usd }."""
    cached = _cache_get("fx:rates", ttl=600)
    if cached:
        return cached
    rates = {"USD": 1.0, "EUR": 0.92, "CHF": 0.88, "BRL": 5.0}
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json().get("rates", {})
                for c in ("EUR", "CHF", "BRL"):
                    if data.get(c):
                        rates[c] = float(data[c])
    except Exception as e:
        logger.warning(f"FX rate fetch failed, using defaults: {e}")
    _cache_set("fx:rates", rates)
    return rates


async def get_eur_usd_rate() -> float:
    rates = await get_fx_rates()
    return rates.get("EUR", 0.92)


# --- Asset sub-type resolution (ETF / fund / REIT) ---
# (7 jul 2026) — DEGIRO, Trading212 e IBKR gravam sempre asset_type="stock"
# nas sincronizações (não distinguem ETF, e IBKR tinha um bug de copy-paste
# que tornava o "if" sempre "stock"). REIT nunca existiu em lado nenhum: o
# Yahoo Finance classifica REITs como EQUITY normal (quoteType), só dá para
# separar olhando ao campo assetProfile.industry (contém "REIT" nesse caso).
# Esta função faz uma única chamada ao quoteSummary do Yahoo e cacheia o
# resultado por símbolo durante 30 dias — o tipo de um ativo muda raramente.
_YF_HEADERS_TYPE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


async def resolve_asset_type(symbol: str, fallback: str = "stock") -> str:
    """Devolve 'etf' / 'fund' / 'reit' / o fallback, consultando o Yahoo
    Finance quando necessário. Só se aplica a símbolos que já estão a ser
    tratados como ações (fallback == 'stock') — crypto e cash não passam
    por aqui."""
    if fallback != "stock":
        return fallback

    cache_key = f"asset_subtype:{symbol.upper()}"
    cached = _cache_get(cache_key, ttl=2_592_000)  # 30 dias
    if cached:
        return cached.get("type", fallback)

    resolved = fallback
    try:
        async with httpx.AsyncClient(timeout=10, headers=_YF_HEADERS_TYPE) as ch:
            for host in ("query2.finance.yahoo.com", "query1.finance.yahoo.com"):
                r = await ch.get(
                    f"https://{host}/v10/finance/quoteSummary/{symbol}",
                    params={"modules": "price,assetProfile", "corsDomain": "finance.yahoo.com", "formatted": "true"},
                )
                if r.status_code != 200:
                    continue
                result = (r.json().get("quoteSummary", {}) or {}).get("result") or []
                if not result:
                    continue
                mod = result[0]
                qt = ((mod.get("price") or {}).get("quoteType") or "").upper()
                if qt == "ETF":
                    resolved = "etf"
                elif qt == "MUTUALFUND":
                    resolved = "fund"
                else:
                    industry = ((mod.get("assetProfile") or {}).get("industry") or "")
                    if "REIT" in industry.upper():
                        resolved = "reit"
                break
    except Exception as e:
        logger.warning(f"resolve_asset_type({symbol}): {e}")

    _cache_set(cache_key, {"type": resolved})
    return resolved


async def resolve_asset_types_bulk(symbols: List[str]) -> dict:
    """Resolve vários símbolos em paralelo (usado na sincronização de
    brokers, onde há vários símbolos únicos a classificar de uma vez)."""
    uniq = list({s.upper() for s in symbols if s})
    results = await asyncio.gather(*[resolve_asset_type(s) for s in uniq], return_exceptions=True)
    return {s: (r if isinstance(r, str) else "stock") for s, r in zip(uniq, results)}


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


# --- Asset name backfill (6 jul 2026: "temos que por o nome do ativo" nos
# Top Movers do painel) -----------------------------------------------------
# compute_holdings_from_txns() above falls back to `name = symbol` whenever
# a transaction was stored without a real display name (older transactions
# added before the search-and-pick UI captured `name`, or CSV imports) — so
# a lot of existing holdings have no proper name to show. Rather than
# fixing this only for new transactions, resolve it live for whatever's
# still missing, but keep it cheap: cached 30 days per symbol/coingecko_id
# (a company/coin's name never changes) via the same in-memory cache used
# everywhere else, so this only ever costs a real network call the FIRST
# time ANY user's portfolio contains that asset — every request after that
# (this user or anyone else) is a cache hit.
_NAME_CACHE_TTL = 30 * 24 * 3600


async def _resolve_crypto_name(coingecko_id: str) -> str | None:
    cache_key = f"crypto_name:{coingecko_id}"
    cached = _cache_get(cache_key, ttl=_NAME_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8) as ch:
            r = await ch.get(
                f"https://api.coingecko.com/api/v3/coins/{coingecko_id}",
                params={
                    "localization": "false", "tickers": "false", "market_data": "false",
                    "community_data": "false", "developer_data": "false", "sparkline": "false",
                },
            )
            r.raise_for_status()
            name = r.json().get("name")
            if name:
                _cache_set(cache_key, name)
            return name
    except Exception as e:
        logger.warning(f"CoinGecko name lookup '{coingecko_id}' error: {e}")
        return None


def _resolve_stock_name_sync(symbol: str) -> str | None:
    try:
        info = yf.Ticker(symbol).info or {}
        return info.get("longName") or info.get("shortName") or None
    except Exception:
        return None


async def _resolve_stock_name(symbol: str) -> str | None:
    cache_key = f"stock_name:{symbol.upper()}"
    cached = _cache_get(cache_key, ttl=_NAME_CACHE_TTL)
    if cached is not None:
        return cached
    name = await asyncio.to_thread(_resolve_stock_name_sync, symbol)
    if name:
        _cache_set(cache_key, name)
    return name


async def backfill_holding_names(holdings: List[dict]) -> None:
    """Mutates `holdings` in place: for every holding whose name is still
    just its symbol, tries to resolve a real display name (see module note
    above). Runs all lookups concurrently and is meant to be awaited
    alongside the price/FX fetches (asyncio.gather in _price_holdings), not
    before them, so it adds no serial latency beyond whatever's already the
    slowest of the group."""
    targets = [
        h for h in holdings
        if (h.get("name") or "").strip().upper() == (h.get("symbol") or "").strip().upper()
    ]
    if not targets:
        return

    async def _resolve(h):
        try:
            if h["asset_type"] == "crypto" and h.get("coingecko_id"):
                name = await _resolve_crypto_name(h["coingecko_id"])
            elif h["asset_type"] in ("stock", "etf", "fund", "bond", "reit"):
                name = await _resolve_stock_name(h["symbol"])
            else:
                name = None
            if name:
                h["name"] = name
        except Exception as e:
            logger.warning(f"Name backfill for {h.get('symbol')} failed: {e}")

    await asyncio.gather(*(_resolve(h) for h in targets), return_exceptions=True)


def _yf_detect_types(symbols: List[str]) -> dict:
    """Sync: returns { symbol: 'etf' | 'fund' | 'stock' } for each symbol."""
    out = {}
    if not symbols:
        return out
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = tickers.tickers.get(sym) or yf.Ticker(sym)
                info = t.info or {}
                qt = (info.get("quoteType") or "").upper()
                if qt == "ETF":
                    out[sym] = "etf"
                elif qt in ("MUTUALFUND", "FUND"):
                    out[sym] = "fund"
                else:
                    # fallback: try fast_info
                    fi = getattr(t, "fast_info", None) or {}
                    qt2 = (fi.get("quoteType") or fi.get("quote_type") or "").upper()
                    if qt2 == "ETF":
                        out[sym] = "etf"
                    elif qt2 in ("MUTUALFUND", "FUND"):
                        out[sym] = "fund"
                    else:
                        out[sym] = "stock"
            except Exception:
                out[sym] = "stock"
    except Exception as e:
        logger.warning(f"_yf_detect_types error: {e}")
    return out


async def detect_and_fix_equity_types(user_id: str) -> dict:
    """
    Check all transactions stored as    Check all transactions stored as 'stock' and update those that
    are actually ETFs or funds in yfinance. Returns { updated: int }.
    Cached for 1 hour per user so it doesn't re-run on every page load.
    """
    cache_key = f"fix_types:{user_id}"
    if _cache_get(cache_key, ttl=3600):
        return {"updated": 0, "cached": True}

    txns = await db.transactions.find(
        {"user_id": user_id, "asset_type": "stock"}, {"_id": 0, "symbol": 1}
    ).to_list(5000)

    symbols = list({t["symbol"].upper() for t in txns})
    if not symbols:
        _cache_set(cache_key, True)
        return {"updated": 0}

    detected = await asyncio.to_thread(_yf_detect_types, symbols)
    updates = {sym: typ for sym, typ in detected.items() if typ != "stock"}

    total_updated = 0
    for sym, new_type in updates.items():
        res = await db.transactions.update_many(
            {"user_id": user_id, "asset_type": "stock", "symbol": sym},
            {"$set": {"asset_type": new_type}},
        )
        total_updated += res.modified_count

    _cache_set(cache_key, True)
    logger.info(f"fix_asset_types user={user_id}: {total_updated} txns updated ({updates})")
    return {"updated": total_updated, "changes": updates}


async def migrate_legacy_assets(user_id: str):
    """One-time migration: convert legacy `assets` rows into BUY transactions."""
    import uuid
    from datetime import datetime, timezone
    legacy = await db.assets.find({"user_id": user_id}).to_list(2000)
    if not legacy:
        return
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

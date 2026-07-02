"""Search endpoints (crypto via CoinGecko, stock via Yahoo Finance)."""
import asyncio
import re

import httpx
import yfinance as yf
from fastapi import APIRouter

from core import _cache_get, _cache_set, logger

router = APIRouter()


@router.get("/search/crypto")
async def search_crypto(q: str):
    if len(q.strip()) < 1:
        return []
    cache_key = f"search_crypto:{q.lower()}"
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://api.coingecko.com/api/v3/search", params={"query": q})
            r.raise_for_status()
            coins = r.json().get("coins", [])[:10]
            result = [
                {"id": c["id"], "symbol": c["symbol"].upper(), "name": c["name"], "thumb": c.get("thumb")}
                for c in coins
            ]
            _cache_set(cache_key, result)
            return result
    except Exception as e:
        logger.error(f"crypto search error: {e}")
        return []


@router.get("/search/stock")
async def search_stock(q: str):
    query = q.strip()
    if len(query) < 1:
        return []
    cache_key = f"search_stock:{query.lower()}"
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached

    async def _yahoo_search(term: str) -> list:
        try:
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as ch:
                r = await ch.get(
                    "https://query2.finance.yahoo.com/v1/finance/search",
                    params={"q": term, "quotesCount": 15, "newsCount": 0},
                )
                if r.status_code != 200:
                    return []
                out = []
                for qq in r.json().get("quotes", []):
                    sym = qq.get("symbol")
                    if not sym:
                        continue
                    qtype = (qq.get("quoteType") or "").upper()
                    # Accept equities, ETFs, funds, and unknown types
                    if qtype in ("CRYPTOCURRENCY", "CURRENCY", "INDEX", "FUTURE", "OPTION"):
                        continue
                    out.append({
                        "symbol": sym,
                        "name": qq.get("longname") or qq.get("shortname") or sym,
                        "exchange": qq.get("exchDisp") or qq.get("exchange") or "",
                        "type": qtype or "EQUITY",
                    })
                return out
        except Exception as e:
            logger.warning(f"Yahoo search '{term}' error: {e}")
            return []

    results = await _yahoo_search(query)

    # Variant search (e.g. "3dVELO" -> "velo 3d", "velo3d", "velo", etc.)
    if not results:
        cleaned = re.sub(r"[^a-zA-Z0-9]", "", query).lower()
        variants = []  # ordered list — most specific first
        if cleaned and cleaned != query.lower():
            variants.append(cleaned)
        # number-prefix patterns: "3dvelo" -> "velo", "velo3d", "velo 3d"
        # treat "3d" as a unit (digit + optional trailing letter like d/k/m)
        m = re.match(r"^(\d+[a-z]?)([a-z].+)$", cleaned)
        if m:
            num, word = m.group(1), m.group(2)
            variants += [word, f"{word}{num}", f"{word} {num}"]
        # number-suffix patterns: "velo3d" -> "velo", "3dvelo", "3d velo"
        m = re.match(r"^([a-z].+?)(\d+[a-z]?)$", cleaned)
        if m:
            word, num = m.group(1), m.group(2)
            variants += [word, f"{num}{word}", f"{num} {word}"]
        # pure alphabetic portion as last resort
        alpha = re.sub(r"[^a-z]", "", cleaned)
        if alpha and alpha not in variants and len(alpha) >= 2:
            variants.append(alpha)
        seen = set()
        for v in variants:
            if v in seen:
                continue
            seen.add(v)
            results = await _yahoo_search(v)
            if results:
                break

    # Direct ticker lookup — plain + European exchange suffixes
    if not results:
        sym = query.upper()
        EU_SUFFIXES = ["", ".PA", ".MI", ".L", ".DE", ".AS", ".BR", ".MC", ".SW",
                       ".VI", ".LS", ".OL", ".CO", ".ST", ".HE", ".WA", ".AT"]

        def _info(s):
            try:
                t = yf.Ticker(s)
                fi = getattr(t, "fast_info", None) or {}
                price = fi.get("last_price") or fi.get("lastPrice")
                if not price:
                    return None
                try:
                    name = (t.info or {}).get("longName") or (t.info or {}).get("shortName") or s
                except Exception:
                    name = s
                return {
                    "symbol": s,
                    "name": name,
                    "exchange": fi.get("exchange") or "",
                    "type": "EQUITY",
                    "price": float(price),
                }
            except Exception:
                return None

        for sfx in EU_SUFFIXES:
            r = await asyncio.to_thread(_info, sym + sfx)
            if r:
                results = [r]
                break

    if results:
        _cache_set(cache_key, results)
    return results[:10]


@router.get("/search")
async def search_unified(q: str):
    """Unified search — stocks + crypto in parallel, deduped by symbol."""
    query = q.strip()
    if len(query) < 1:
        return []
    cache_key = f"search_unified:{query.lower()}"
    cached = _cache_get(cache_key, ttl=180)
    if cached:
        return cached

    stocks_task = search_stock(query)
    crypto_task = search_crypto(query)
    stocks, crypto = await asyncio.gather(stocks_task, crypto_task, return_exceptions=True)

    if isinstance(stocks, Exception):
        stocks = []
    if isinstance(crypto, Exception):
        crypto = []

    # Normalize crypto items to same shape as stocks
    crypto_norm = [
        {
            "symbol": c["symbol"],
            "name": c["name"],
            "exchange": "Crypto",
            "type": "CRYPTOCURRENCY",
            "thumb": c.get("thumb"),
            "crypto_id": c.get("id"),
        }
        for c in (crypto or [])
    ]

    # Merge: stocks first, then crypto — skip crypto symbols already in stocks
    seen = {r["symbol"].upper() for r in (stocks or [])}
    merged = list(stocks or [])
    for c in crypto_norm:
        if c["symbol"].upper() not in seen:
            merged.append(c)
            seen.add(c["symbol"].upper())

    result = merged[:12]
    if result:
        _cache_set(cache_key, result)
    return result

"""Search endpoints (crypto via CoinGecko, stock via Yahoo Finance)."""
import asyncio
import re

import httpx
import yfinance as yf
from fastapi import APIRouter

from core import _cache_get, _cache_set, logger
from prices import _yf_fetch

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
                    params={"q": term, "quotesCount": 10, "newsCount": 0},
                )
                if r.status_code != 200:
                    return []
                out = []
                for qq in r.json().get("quotes", []):
                    sym = qq.get("symbol")
                    if not sym:
                        continue
                    qtype = (qq.get("quoteType") or "").upper()
                    if qtype not in ("EQUITY", "ETF", "MUTUALFUND", ""):
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

    if not results:
        cleaned = re.sub(r"[^a-zA-Z0-9]", "", query).lower()
        variants = set()
        if cleaned and cleaned != query.lower():
            variants.add(cleaned)
        m = re.match(r"^3d(.+)$", cleaned)
        if m:
            variants.add(f"{m.group(1)} 3d")
            variants.add(f"{m.group(1)}3d")
        m = re.match(r"^(.+)3d$", cleaned)
        if m:
            variants.add(f"3d{m.group(1)}")
            variants.add(f"3d {m.group(1)}")
        for v in variants:
            results = await _yahoo_search(v)
            if results:
                break

    if not results:
        sym = query.upper()

        def _info(s):
            try:
                t = yf.Ticker(s)
                fi = getattr(t, "fast_info", None) or {}
                price = fi.get("last_price") or fi.get("lastPrice")
                if not price:
                    return None
                return {"symbol": s, "name": s, "exchange": "", "type": "EQUITY", "price": float(price)}
            except Exception:
                return None

        info = await asyncio.to_thread(_info, sym)
        if info:
            results = [info]

    if results:
        top_syms = [r["symbol"] for r in results[:5]]
        prices = await asyncio.to_thread(_yf_fetch, top_syms)
        for r in results:
            p = prices.get(r["symbol"], {})
            if p.get("usd"):
                r["price"] = float(p["usd"])

    _cache_set(cache_key, results)
    return results

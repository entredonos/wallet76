"""Per-asset news + per-asset historical chart."""
import asyncio

import httpx
import yfinance as yf
from fastapi import APIRouter

from core import _cache_get, _cache_set, logger

router = APIRouter()


@router.get("/news")
async def get_news(symbol: str, asset_type: str = "stock"):
    if not symbol:
        return []
    cache_key = f"news:{asset_type}:{symbol.upper()}"
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached
    yf_sym = f"{symbol.upper()}-USD" if asset_type == "crypto" else symbol.upper()

    def _fetch(s):
        try:
            t = yf.Ticker(s)
            items = t.news or []
            out = []
            for n in items[:20]:
                content = n.get("content") or n
                title = content.get("title") or n.get("title")
                link = None
                if content.get("canonicalUrl"):
                    link = content["canonicalUrl"].get("url")
                elif content.get("clickThroughUrl"):
                    link = content["clickThroughUrl"].get("url")
                else:
                    link = n.get("link")
                pub = (content.get("provider") or {}).get("displayName") or n.get("publisher", "")
                ts = content.get("pubDate") or n.get("providerPublishTime")
                thumb = None
                thumb_obj = content.get("thumbnail") or n.get("thumbnail")
                if thumb_obj:
                    res = thumb_obj.get("resolutions") or []
                    if res:
                        thumb = res[0].get("url")
                summary = content.get("summary") or n.get("summary", "")
                if not title or not link:
                    continue
                out.append({
                    "id": n.get("id") or n.get("uuid"),
                    "title": title,
                    "link": link,
                    "publisher": pub,
                    "ts": ts,
                    "thumbnail": thumb,
                    "summary": summary[:300] if summary else "",
                })
            return out
        except Exception as e:
            logger.warning(f"news {s} err: {e}")
            return []

    items = await asyncio.to_thread(_fetch, yf_sym)
    if not items and asset_type == "crypto":
        items = await asyncio.to_thread(_fetch, symbol.upper())
    _cache_set(cache_key, items)
    return items


@router.get("/asset/history")
async def asset_history(symbol: str, asset_type: str, interval: str = "1h", range: str = "1w", coingecko_id: str = ""):
    cache_key = f"asset_hist:{asset_type}:{symbol}:{coingecko_id}:{interval}:{range}"
    cached = _cache_get(cache_key, ttl=120)
    if cached:
        return cached

    def _fetch_yf(yf_symbol: str):
        period_map = {
            "5m": ("1d", "5m"),
            "15m": ("5d", "15m"),
            "30m": ("5d", "30m"),
            "1h": ("5d", "60m"),
            "2h": ("1mo", "60m"),
            "4h": ("1mo", "60m"),
            "1d": ("5d", "15m"),
            "1w": ("1mo", "1h"),
            "1m": ("3mo", "1d"),
            "1y": ("1y", "1d"),
            "all": ("max", "1wk"),
        }
        period, interval_yf = period_map.get(range, ("1mo", "1h"))
        try:
            t = yf.Ticker(yf_symbol)
            hist = t.history(period=period, interval=interval_yf)
            if hist.empty:
                return []
            pts = []
            for ts, row in hist.iterrows():
                pts.append({"t": int(ts.timestamp() * 1000), "p": float(row["Close"])})
            return pts
        except Exception as e:
            logger.warning(f"asset_history yfinance({yf_symbol}) err: {e}")
            return []

    if asset_type == "crypto":
        cg = coingecko_id or symbol.lower()
        days_map = {"5m": 1, "15m": 1, "30m": 1, "1h": 1, "2h": 1, "4h": 1, "1d": 1, "1w": 7, "1m": 30, "1y": 365, "all": "max"}
        days = days_map.get(range, 7)
        pts = []
        try:
            async with httpx.AsyncClient(timeout=15) as ch:
                r = await ch.get(
                    f"https://api.coingecko.com/api/v3/coins/{cg}/market_chart",
                    params={"vs_currency": "usd", "days": str(days)},
                )
                if r.status_code == 200:
                    prices = r.json().get("prices", [])
                    pts = [{"t": p[0], "p": p[1]} for p in prices]
        except Exception as e:
            logger.warning(f"asset_history crypto CG err: {e}")
        if not pts:
            yf_sym = f"{symbol.upper()}-USD"
            pts = await asyncio.to_thread(_fetch_yf, yf_sym)
        _cache_set(cache_key, pts)
        return pts

    sym = symbol.upper()
    resolved = _cache_get(f"resolve:{sym.lower()}", ttl=86400)
    if resolved and resolved != "":
        sym = resolved
    pts = await asyncio.to_thread(_fetch_yf, sym)
    _cache_set(cache_key, pts)
    return pts

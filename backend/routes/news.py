"""Per-asset news + per-asset historical chart."""
import asyncio
from datetime import datetime, timezone as _tz

import httpx
import yfinance as yf
from fastapi import APIRouter

from core import _cache_get, _cache_set, logger

router = APIRouter()

# Every range button is a CANDLE SIZE, not a look-back window — clicking
# "30m" always shows the last N_BARS candles of 30-minute size (however far
# back that reaches), "4h" the last N_BARS candles of 4-hour size, "1D" the
# last N_BARS *daily* candles, "1Y" the last N_BARS *yearly* candles, and so
# on — the same rule for every single button. If an asset simply doesn't
# have that much history yet, we just return whatever exists (no padding,
# no error). "ALL" is the one exception: it always shows the complete
# available history, uncapped.
N_BARS = 70

# Intraday native yfinance intervals. Rather than computing the "minimal"
# number of calendar days that should contain N_BARS candles (fragile —
# depends on exact trading hours, holidays, half-days, weekends, none of
# which are known precisely up front), we just fetch a generously wide,
# fixed window — Yahoo's own lookback cap for 15m/30m, and a wide-enough
# multi-month window for 60m — and keep the last N_BARS candles from
# whatever comes back. One API call either way; the only cost of asking for
# "too much" is a slightly bigger response, not a slower or failed request.
_INTRADAY = {
    "15m": {"interval": "15m", "period": "60d"},
    "30m": {"interval": "30m", "period": "60d"},
    "1h":  {"interval": "60m", "period": "270d"},
}

# Daily-or-coarser native yfinance intervals — Yahoo has no lookback cap for
# these, so we just pull the full available history and keep the last
# N_BARS candles (or fewer, if the asset doesn't have that much yet).
_LONG_NATIVE = {
    "1d": "1d",
    "1w": "1wk",
    "1m": "1mo",
}

# Yahoo has no native 4-hour or 1-year bars — build them ourselves by
# merging consecutive candles into one OHLC candle each (60m→4h, 1mo→1y).
# "period" reuses the same generously wide 60m window as the "1h" button.
_RESAMPLE = {
    "4h": {"base_interval": "60m", "period": "270d", "factor": 4},
    "1y": {"base_interval": "1mo", "factor": 12},
}

# CoinGecko's OHLC endpoint auto-selects candle size from `days`
# (1-2d -> 30m, 3-30d -> 4h, 31-365d -> 4d). We pick `days` per range to get
# candles as close as possible to what the button implies. Only used as the
# primary crypto source; yfinance (native, same logic as stocks) is the
# fallback if CoinGecko has nothing.
_CG_DAYS = {
    "15m": 1, "30m": 1, "1h": 1,
    "4h": 7,
    "1d": 90, "1w": 365, "1m": 1500, "1y": "max", "all": "max",
}


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


def _num_or(value, fallback):
    """float(value), falling back when value is NaN/None (NaN != NaN)."""
    try:
        v = float(value)
        return v if v == v else fallback
    except (TypeError, ValueError):
        return fallback


def _rows_to_points(hist):
    pts = []
    for ts, row in hist.iterrows():
        c = float(row["Close"])
        pts.append({
            "t": int(ts.timestamp() * 1000),
            "o": _num_or(row["Open"], c),
            "h": _num_or(row["High"], c),
            "l": _num_or(row["Low"], c),
            "c": c,
            "p": c,  # kept for backward-compat with any area-chart consumer
        })
    return pts


def _chunk_ohlc(pts, factor):
    """Merge every `factor` consecutive candles into one OHLC candle."""
    out = []
    for i in range(0, len(pts), factor):
        chunk = pts[i:i + factor]
        if not chunk:
            continue
        close = chunk[-1]["c"]
        out.append({
            "t": chunk[0]["t"],
            "o": chunk[0]["o"],
            "h": max(c["h"] for c in chunk),
            "l": min(c["l"] for c in chunk),
            "c": close,
            "p": close,
        })
    return out


def _resample_ohlc(pts, factor):
    """Merge every `factor` consecutive candles into one OHLC candle, used
    for coarse/period-based resampling (e.g. monthly -> yearly) where there's
    no notion of a trading session to keep aligned with."""
    return _chunk_ohlc(pts, factor)


def _resample_intraday_ohlc(pts, factor):
    """Same idea as `_resample_ohlc`, but resets the grouping at every
    calendar-day boundary. Stocks/ETFs only trade part of the day (~6.5h),
    so a plain sequential chunk-by-`factor` slowly drifts out of alignment
    with day boundaries over time — the leftover partial group at the end of
    one trading day bleeds into the next day's first candle, so some days
    end up with more/fewer candles than others. Grouping per calendar day
    first keeps every full trading day's candle count consistent (crypto,
    which trades 24/7, divides evenly by `factor` anyway so this is a no-op
    for it in practice)."""
    out = []
    day_group = []
    current_day = None
    for p in pts:
        day = datetime.fromtimestamp(p["t"] / 1000, tz=_tz.utc).date()
        if current_day is not None and day != current_day:
            out.extend(_chunk_ohlc(day_group, factor))
            day_group = []
        day_group.append(p)
        current_day = day
    if day_group:
        out.extend(_chunk_ohlc(day_group, factor))
    return out


def _fetch_yf(yf_symbol: str, range_key: str):
    try:
        t = yf.Ticker(yf_symbol)

        # Intraday (15m/30m/1h): fixed generous window, then take the tail.
        if range_key in _INTRADAY:
            cfg = _INTRADAY[range_key]
            hist = t.history(period=cfg["period"], interval=cfg["interval"])
            pts = _rows_to_points(hist) if not hist.empty else []
            return pts[-N_BARS:]

        # Daily/weekly/monthly (1D/1W/1M): no Yahoo lookback cap — just pull
        # everything available and keep the last N_BARS candles.
        if range_key in _LONG_NATIVE:
            hist = t.history(period="max", interval=_LONG_NATIVE[range_key])
            pts = _rows_to_points(hist) if not hist.empty else []
            return pts[-N_BARS:]

        # Resampled (4H from 60m, 1Y from 1mo).
        if range_key in _RESAMPLE:
            cfg = _RESAMPLE[range_key]
            if "period" in cfg:
                hist = t.history(period=cfg["period"], interval=cfg["base_interval"])
                pts = _rows_to_points(hist) if not hist.empty else []
                # Day-boundary-aware: keeps candle count per trading day
                # consistent instead of drifting (see _resample_intraday_ohlc).
                return _resample_intraday_ohlc(pts, cfg["factor"])[-N_BARS:]
            hist = t.history(period="max", interval=cfg["base_interval"])
            pts = _rows_to_points(hist) if not hist.empty else []
            return _resample_ohlc(pts, cfg["factor"])[-N_BARS:]

        # "ALL" (and anything unrecognised): full available history,
        # uncapped, at a coarse weekly resolution.
        hist = t.history(period="max", interval="1wk")
        return _rows_to_points(hist) if not hist.empty else []
    except Exception as e:
        logger.warning(f"asset_history yfinance({yf_symbol}) err: {e}")
        return []


async def _fetch_crypto_ohlc(cg_id: str, range_key: str):
    days = _CG_DAYS.get(range_key, 7)
    try:
        async with httpx.AsyncClient(timeout=15) as ch:
            r = await ch.get(
                f"https://api.coingecko.com/api/v3/coins/{cg_id}/ohlc",
                params={"vs_currency": "usd", "days": str(days)},
            )
            if r.status_code == 200:
                rows = r.json() or []
                pts = [{"t": int(row[0]), "o": row[1], "h": row[2], "l": row[3], "c": row[4], "p": row[4]} for row in rows]
                if range_key != "all":
                    pts = pts[-N_BARS:]
                return pts
    except Exception as e:
        logger.warning(f"asset_history crypto OHLC err: {e}")
    return []


@router.get("/asset/history")
async def asset_history(symbol: str, asset_type: str, interval: str = "1h", range: str = "1w", coingecko_id: str = ""):
    cache_key = f"asset_hist:{asset_type}:{symbol}:{coingecko_id}:{interval}:{range}:v8"
    cached = _cache_get(cache_key, ttl=120)
    if cached:
        return cached

    if asset_type == "crypto":
        cg = coingecko_id or symbol.lower()
        yf_sym = f"{symbol.upper()}-USD"
        if range in ("15m", "30m", "1h"):
            # CoinGecko's /coins/{id}/ohlc has no real 15m/30m/1h option — it
            # auto-picks candle size purely from `days` (1-2d -> 30m,
            # 3-30d -> 4h, 31-365d -> daily), and _CG_DAYS maps all three of
            # these buttons to days=1. CoinGecko "succeeds" every time with
            # the exact same 30-minute candles regardless of which button was
            # clicked, so the yfinance fallback below never even ran —
            # 15m/30m/1h looked byte-identical for every crypto asset except
            # for the x-axis. yfinance DOES support genuine 15m/30m/60m
            # intervals for crypto tickers (BTC-USD etc), so prefer it here;
            # CoinGecko stays primary for 4h+ where its day-based tiers
            # actually line up with what the button implies.
            pts = await asyncio.to_thread(_fetch_yf, yf_sym, range)
            if not pts:
                pts = await _fetch_crypto_ohlc(cg, range)
        else:
            pts = await _fetch_crypto_ohlc(cg, range)
            if not pts:
                pts = await asyncio.to_thread(_fetch_yf, yf_sym, range)
        _cache_set(cache_key, pts)
        return pts

    sym = symbol.upper()
    resolved = _cache_get(f"resolve:{sym.lower()}", ttl=86400)
    if resolved and resolved != "":
        sym = resolved
    pts = await asyncio.to_thread(_fetch_yf, sym, range)
    _cache_set(cache_key, pts)
    return pts

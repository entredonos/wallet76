"""Asset detail: price, metrics, analyst recommendations, chart data."""
import asyncio
from datetime import datetime

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException

from core import db, get_current_user, _cache_get, _cache_set, logger
from prices import compute_holdings_from_txns

router = APIRouter()

_YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


def _sf(v, default=None):
    try:
        return float(v) if v is not None else default
    except Exception:
        return default


def _si(v, default=None):
    try:
        return int(v) if v is not None else default
    except Exception:
        return default


def _raw(module: dict, *keys):
    """Navigate nested Yahoo Finance raw/fmt structure."""
    for k in keys:
        if not isinstance(module, dict):
            return None
        module = module.get(k)
    if isinstance(module, dict):
        return module.get("raw") or module.get("fmt")
    return module


async def _yf_quote_summary(symbol: str) -> dict:
    """
    Single async HTTP call to Yahoo Finance quoteSummary API.
    Returns all modules we need in one round-trip (~0.5–2s).
    """
    modules = "price,summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,upgradeDowngradeHistory,assetProfile"
    url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
    # Try both Yahoo Finance hosts
    for host in ("query2.finance.yahoo.com", "query1.finance.yahoo.com"):
        try:
            async with httpx.AsyncClient(timeout=12, headers=_YF_HEADERS) as ch:
                r = await ch.get(
                    f"https://{host}/v10/finance/quoteSummary/{symbol}",
                    params={"modules": modules, "corsDomain": "finance.yahoo.com", "formatted": "true"}
                )
                if r.status_code == 200:
                    data = r.json()
                    result = data.get("quoteSummary", {}).get("result") or []
                    if result:
                        return result[0]
                logger.warning(f"quoteSummary {symbol} via {host}: HTTP {r.status_code}")
        except Exception as e:
            logger.warning(f"quoteSummary {symbol} via {host}: {e}")
    return {}


async def _yf_fast_info_fallback(symbol: str) -> dict | None:
    """
    Fallback using yfinance fast_info — slower (~3-5s) but works when
    the HTTP API is rate-limited or returns empty for crypto symbols.
    """
    def _sync():
        try:
            t = yf.Ticker(symbol)
            fi = t.fast_info
            price = getattr(fi, "last_price", None) or getattr(fi, "regularMarketPrice", None)
            if not price:
                return None
            prev = getattr(fi, "previous_close", None)
            change = (price - prev) if prev else None
            change_pct = ((price - prev) / prev * 100) if prev else None
            qt = getattr(fi, "quote_type", "") or ""
            asset_type = {
                "ETF": "etf", "MUTUALFUND": "fund", "CRYPTOCURRENCY": "crypto"
            }.get(qt.upper(), "stock")
            return {
                "symbol":     symbol,
                "name":       getattr(fi, "currency", symbol),
                "exchange":   getattr(fi, "exchange", ""),
                "currency":   getattr(fi, "currency", "USD"),
                "asset_type": asset_type,
                "sector":     None, "industry": None, "country": None,
                "website":    None, "description": "",
                "price":      float(price),
                "prev_close": float(prev) if prev else None,
                "change":     float(change) if change is not None else None,
                "change_pct": float(change_pct) if change_pct is not None else None,
                "open":       _sf(getattr(fi, "open", None)),
                "day_high":   _sf(getattr(fi, "day_high", None)),
                "day_low":    _sf(getattr(fi, "day_low", None)),
                "week_52_high": _sf(getattr(fi, "year_high", None)),
                "week_52_low":  _sf(getattr(fi, "year_low", None)),
                "volume":     _si(getattr(fi, "three_month_average_volume", None)),
                "avg_volume": _si(getattr(fi, "three_month_average_volume", None)),
                "market_cap": _sf(getattr(fi, "market_cap", None)),
                "pe_ratio":   None, "forward_pe": None, "eps": None,
                "dividend_yield": None, "beta": None,
                "analyst": {
                    "recommendation": "", "mean_score": None, "n_analysts": None,
                    "target_mean": None, "target_high": None, "target_low": None,
                    "distribution": None, "upgrades": [],
                },
            }
        except Exception as e:
            logger.warning(f"fast_info fallback {symbol}: {e}")
            return None
    return await asyncio.to_thread(_sync)


async def _yf_chart_async(symbol: str, period: str, interval: str) -> list:
    """Async chart data fetch from Yahoo Finance v8 chart API."""
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": period, "interval": interval, "includePrePost": "false"}
    try:
        async with httpx.AsyncClient(timeout=12, headers=_YF_HEADERS) as ch:
            r = await ch.get(url, params=params)
            if r.status_code != 200:
                return []
            data = r.json()
            chart = data.get("chart", {}).get("result") or []
            if not chart:
                return []
            ts = chart[0].get("timestamp") or []
            closes = (chart[0].get("indicators", {}).get("quote") or [{}])[0].get("close") or []
            opens  = (chart[0].get("indicators", {}).get("quote") or [{}])[0].get("open")  or []
            highs  = (chart[0].get("indicators", {}).get("quote") or [{}])[0].get("high")  or []
            lows   = (chart[0].get("indicators", {}).get("quote") or [{}])[0].get("low")   or []
            vols   = (chart[0].get("indicators", {}).get("quote") or [{}])[0].get("volume") or []
            out = []
            for i, t in enumerate(ts):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                out.append({
                    "t": int(t) * 1000,
                    "o": round(float(opens[i]),  4) if i < len(opens)  and opens[i]  else round(float(c), 4),
                    "h": round(float(highs[i]),  4) if i < len(highs)  and highs[i]  else round(float(c), 4),
                    "l": round(float(lows[i]),   4) if i < len(lows)   and lows[i]   else round(float(c), 4),
                    "c": round(float(c),         4),
                    "v": int(vols[i]) if i < len(vols) and vols[i] else 0,
                })
            return out
    except Exception as e:
        logger.warning(f"chart {symbol} {period}: {e}")
        return []


def _parse_quote_summary(sym: str, qs: dict) -> dict:
    """Parse quoteSummary modules into a flat detail dict."""
    pr   = qs.get("price", {})
    sd   = qs.get("summaryDetail", {})
    ks   = qs.get("defaultKeyStatistics", {})
    fd   = qs.get("financialData", {})
    ap   = qs.get("assetProfile", {})
    rt   = qs.get("recommendationTrend", {})
    udh  = qs.get("upgradeDowngradeHistory", {})

    # Price
    price      = _sf(_raw(pr, "regularMarketPrice"))
    prev_close = _sf(_raw(pr, "regularMarketPreviousClose"))
    change     = _sf(_raw(pr, "regularMarketChange"))
    change_pct = _sf(_raw(pr, "regularMarketChangePercent"))
    if change_pct:
        change_pct *= 100  # convert 0.003 → 0.3 if needed
        if abs(change_pct) > 50:  # already in percentage form
            change_pct = change_pct / 100

    # Asset type
    qt = (pr.get("quoteType") or "").upper()
    asset_type = {"ETF": "etf", "MUTUALFUND": "fund", "CRYPTOCURRENCY": "crypto"}.get(qt, "stock")

    # Analyst recommendations trend
    trend_list = rt.get("trend") or []
    analyst_dist = None
    if trend_list:
        latest_trend = trend_list[0]  # most recent period
        analyst_dist = {
            "strongBuy":  _si(latest_trend.get("strongBuy", 0)) or 0,
            "buy":        _si(latest_trend.get("buy", 0)) or 0,
            "hold":       _si(latest_trend.get("hold", 0)) or 0,
            "sell":       _si(latest_trend.get("sell", 0)) or 0,
            "strongSell": _si(latest_trend.get("strongSell", 0)) or 0,
        }

    # Recent upgrades/downgrades
    upgrades = []
    for u in (udh.get("history") or [])[:5]:
        upgrades.append({
            "date":       (u.get("epochGradeDate") and str(u["epochGradeDate"])[:10]) or "",
            "firm":       u.get("firm") or "",
            "from_grade": u.get("fromGrade") or "",
            "to_grade":   u.get("toGrade") or "",
            "action":     u.get("action") or "",
        })

    # Recommendation key + score
    rec_key   = fd.get("recommendationKey") or pr.get("recommendationKey") or ""
    rec_mean  = _sf(_raw(fd, "recommendationMean"))
    n_analysts= _si(_raw(fd, "numberOfAnalystOpinions"))
    target_mean = _sf(_raw(fd, "targetMeanPrice"))
    target_high = _sf(_raw(fd, "targetHighPrice"))
    target_low  = _sf(_raw(fd, "targetLowPrice"))

    desc = ap.get("longBusinessSummary") or ""

    return {
        "symbol":   sym,
        "name":     pr.get("longName") or pr.get("shortName") or sym,
        "exchange": pr.get("exchangeName") or pr.get("exchange") or "",
        "currency": pr.get("currency") or "USD",
        "asset_type": asset_type,
        "sector":   ap.get("sector"),
        "industry": ap.get("industry"),
        "country":  ap.get("country"),
        "website":  ap.get("website"),
        "description": desc[:600] if desc else "",

        "price":      price,
        "prev_close": prev_close,
        "change":     change,
        "change_pct": change_pct,
        "open":       _sf(_raw(pr, "regularMarketOpen")),
        "day_high":   _sf(_raw(pr, "regularMarketDayHigh")),
        "day_low":    _sf(_raw(pr, "regularMarketDayLow")),
        "week_52_high": _sf(_raw(sd, "fiftyTwoWeekHigh")),
        "week_52_low":  _sf(_raw(sd, "fiftyTwoWeekLow")),
        "volume":     _si(_raw(pr, "regularMarketVolume")),
        "avg_volume": _si(_raw(sd, "averageVolume")),
        "market_cap": _sf(_raw(pr, "marketCap")),
        "pe_ratio":   _sf(_raw(sd, "trailingPE")),
        "forward_pe": _sf(_raw(sd, "forwardPE")),
        "eps":        _sf(_raw(ks, "trailingEps")),
        "dividend_yield": _sf(_raw(sd, "dividendYield")),
        "beta":       _sf(_raw(sd, "beta")),

        "analyst": {
            "recommendation": rec_key,
            "mean_score":  rec_mean,
            "n_analysts":  n_analysts,
            "target_mean": target_mean,
            "target_high": target_high,
            "target_low":  target_low,
            "distribution": analyst_dist,
            "upgrades": upgrades,
        },
    }


# ── Chart endpoint ────────────────────────────────────────────────────────────

PERIOD_MAP = {
    "1D":  ("1d",  "5m"),
    "1W":  ("5d",  "30m"),
    "1M":  ("1mo", "1d"),
    "3M":  ("3mo", "1d"),
    "1Y":  ("1y",  "1wk"),
    "ALL": ("max", "1mo"),
}


@router.get("/asset/{symbol}/chart")
async def get_asset_chart(symbol: str, period: str = "1W"):
    sym = symbol.upper()
    yf_period, yf_interval = PERIOD_MAP.get(period, ("5d", "30m"))
    ttl = 60 if period == "1D" else 300
    cache_key = f"asset_chart2:{sym}:{period}"
    cached = _cache_get(cache_key, ttl=ttl)
    if cached is not None:
        return cached
    data = await _yf_chart_async(sym, yf_period, yf_interval)
    _cache_set(cache_key, data)
    return data


# ── Dividend enrichment ───────────────────────────────────────────────────────

_MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def _fetch_dividend_info(sym: str) -> dict:
    """Fetch trailing 12-month dividend data synchronously (run in thread)."""
    try:
        import pandas as pd
        ticker = yf.Ticker(sym)
        info   = ticker.info or {}

        div_rate = info.get("dividendRate") or info.get("trailingAnnualDividendRate") or 0
        if not div_rate or div_rate <= 0:
            return {}

        divs = ticker.dividends
        if divs is None or len(divs) == 0:
            return {}

        # Trailing 12-month sum
        cutoff_1y = pd.Timestamp.now(tz="UTC") - pd.DateOffset(years=1)
        divs_1y   = divs[divs.index >= cutoff_1y]
        trailing  = float(divs_1y.sum()) if len(divs_1y) > 0 else float(div_rate)

        # Frequency from gaps
        if len(divs) >= 2:
            gaps = [(divs.index[i] - divs.index[i-1]).days for i in range(max(1, len(divs)-8), len(divs))]
            avg_gap = sum(gaps) / len(gaps) if gaps else 90
        else:
            avg_gap = 90

        if avg_gap <= 45:
            freq, freq_per_year = "monthly", 12
        elif avg_gap <= 120:
            freq, freq_per_year = "quarterly", 4
        elif avg_gap <= 240:
            freq, freq_per_year = "semi-annual", 2
        else:
            freq, freq_per_year = "annual", 1

        rate_per_payment = round(trailing / freq_per_year, 4) if trailing else None

        # Trailing yield
        current_price = (
            info.get("regularMarketPrice") or
            info.get("currentPrice") or
            info.get("previousClose") or 0
        )
        yield_pct = round(trailing / float(current_price) * 100, 2) if current_price and trailing else None

        # Payment months (last 2 years)
        cutoff_2y = pd.Timestamp.now(tz="UTC") - pd.DateOffset(years=2)
        recent2y  = divs[divs.index >= cutoff_2y]
        pay_months: list = []
        pay_month_days: dict = {}
        if len(recent2y) > 0:
            months_seen = sorted(set(d.month for d in recent2y.index))
            pay_months  = [_MONTH_ABBR[m-1] for m in months_seen]
            day_groups: dict = {}
            for d in recent2y.index:
                abbr = _MONTH_ABBR[d.month-1]
                day_groups.setdefault(abbr, []).append(d.day)
            pay_month_days = {k: round(sum(v)/len(v)) for k, v in day_groups.items()}

        return {
            "div_frequency":        freq,
            "div_yield_trailing":   yield_pct,
            "div_rate_annual":      round(trailing, 4),
            "div_rate_per_payment": rate_per_payment,
            "div_pay_months":       pay_months,
            "div_pay_month_days":   pay_month_days,
        }
    except Exception:
        return {}


# -- Asset detail endpoint -----------------------------------------------------

@router.get("/asset/{symbol}")
async def get_asset_detail(symbol: str, user=Depends(get_current_user)):
    sym = symbol.upper()
    cache_key = f"asset_detail2:{sym}"
    cached = _cache_get(cache_key, ttl=300)

    if cached:
        detail = cached
    else:
        qs = await _yf_quote_summary(sym)
        if qs:
            detail = _parse_quote_summary(sym, qs)
        else:
            detail = None

        if not detail or not detail.get("price"):
            logger.info(f"quoteSummary failed for {sym}, trying fast_info fallback")
            detail = await _yf_fast_info_fallback(sym)

        if not detail or not detail.get("price"):
            raise HTTPException(404, f"Asset '{sym}' not found")

        # Enrich with dividend data (best-effort)
        if detail.get("asset_type") in ("stock", "etf", "fund"):
            try:
                div_info = await asyncio.to_thread(_fetch_dividend_info, sym)
                detail.update(div_info)
            except Exception:
                pass

        _cache_set(cache_key, detail)

    # User position
    txns = await db.transactions.find(
        {"user_id": user["id"], "symbol": sym},
        {"_id": 0}
    ).to_list(1000)

    position = None
    if txns:
        holdings = compute_holdings_from_txns(txns)
        h = next((x for x in holdings if x["symbol"] == sym), None)
        if h and h["quantity"] > 0:
            price = detail.get("price") or 0
            value = h["quantity"] * price
            cost  = h["total_cost_usd"]
            pnl   = value - cost
            pnl_pct = (pnl / cost * 100) if cost else 0
            position = {
                "quantity":       h["quantity"],
                "avg_cost_usd":   h["avg_cost_usd"],
                "total_cost_usd": cost,
                "value_usd":      value,
                "pnl_usd":        pnl,
                "pnl_pct":        pnl_pct,
            }

    return {**detail, "position": position}


# -- Unified search ------------------------------------------------------------

@router.get("/search")
async def search_assets(q: str = ""):
    query = q.strip()
    if len(query) < 1:
        return []
    cache_key = f"search_unified:{query.lower()}"
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8, headers=_YF_HEADERS) as ch:
            r = await ch.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={"q": query, "lang": "en-US", "region": "US", "quotesCount": 10, "newsCount": 0},
            )
            if r.status_code != 200:
                return []
            quotes = r.json().get("quotes", [])
            results = []
            for q_ in quotes:
                t = q_.get("quoteType", "").upper()
                atype = {"ETF": "etf", "MUTUALFUND": "fund", "CRYPTOCURRENCY": "crypto"}.get(t, "stock")
                results.append({
                    "symbol":     q_.get("symbol", ""),
                    "name":       q_.get("longname") or q_.get("shortname") or "",
                    "exchange":   q_.get("exchange", ""),
                    "asset_type": atype,
                })
            _cache_set(cache_key, results, ttl=300)
            return results
    except Exception as e:
        logger.warning(f"search error: {e}")
        return []

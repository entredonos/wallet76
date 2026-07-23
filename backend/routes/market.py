"""Market data: top movers (crypto & stocks), latest news, portfolio news."""
import asyncio
from datetime import datetime

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends

from core import db, get_current_user, _cache_get, _cache_set, _cache_get_stale, logger

router = APIRouter()


# Bumped from 150s/240s (crypto/stocks) to 1000s on 3 jul 2026, alongside
# MARKET_REFRESH_INTERVAL_SECONDS below — tonight's incident (CoinGecko 429
# storm + Render OOM) showed the previous 2-4 min cadence was too aggressive
# for the free-tier APIs under real load. Slightly longer than the refresh
# interval so a request landing right at the boundary still hits the cache
# the background refresher just wrote, instead of triggering its own fetch.
MOVERS_CRYPTO_TTL = 1000
MOVERS_STOCKS_TTL = 1000

# Universe definition surfaced to the user via the info popup next to the
# "Top Gainers"/"Top Losers" titles on the Mercado page (see market.crypto_
# universe_note in I18nContext.jsx) — keep in sync with the actual CoinGecko
# call below, not just the copy. Gainers/losers themselves are a plain
# top-10-by-rank (no >0%/<0% filter, no stock price floor) — reverted at the
# user's request on 3 jul 2026, back to how it worked before that change.
CRYPTO_UNIVERSE_SIZE = 250  # CoinGecko per_page above, top 250 by market cap


@router.get("/market/movers/crypto")
async def market_movers_crypto():
    """Top 10 gainers and losers over 24h from CoinGecko's top 250 (yfinance fallback)."""
    cache_key = "market_movers_crypto"
    cached = _cache_get(cache_key, ttl=MOVERS_CRYPTO_TTL)
    if cached and (cached.get("gainers") or cached.get("losers")):
        return cached
    return await _fetch_movers_crypto()


async def _fetch_movers_crypto():
    """Actual fetch logic for crypto movers, split out of the route handler
    so run_market_movers_refresher() (background warmer, see below) can call
    it directly without going through a cache-check + HTTP layer."""
    cache_key = "market_movers_crypto"
    out = {"gainers": [], "losers": []}
    try:
        async with httpx.AsyncClient(timeout=12) as ch:
            r = await ch.get(
                "https://api.coingecko.com/api/v3/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": CRYPTO_UNIVERSE_SIZE,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h",
                },
            )
            if r.status_code == 200:
                rows = r.json()
                cleaned = [{
                    "symbol": x.get("symbol", "").upper(),
                    "coingecko_id": x.get("id"),
                    "name": x.get("name"),
                    "image": x.get("image"),
                    "price_usd": x.get("current_price"),
                    "change_24h": x.get("price_change_percentage_24h") or 0,
                    "market_cap_usd": x.get("market_cap"),
                    "volume_24h_usd": x.get("total_volume"),
                } for x in rows if x.get("price_change_percentage_24h") is not None]
                cleaned.sort(key=lambda d: d["change_24h"], reverse=True)
                out["gainers"] = cleaned[:10]
                out["losers"] = sorted(cleaned, key=lambda d: d["change_24h"])[:10]
                _cache_set(cache_key, out)
                return out
    except Exception as e:
        logger.warning(f"market crypto err: {e}")

    # CoinGecko failed or rate-limited (HTTP 429 on the free tier is common
    # once several users/instances share it). Prefer serving the last known
    # good snapshot — even a few minutes stale — over falling all the way
    # down to the ~30-coin yfinance emergency list below: a stale top-250 is
    # far more representative than a fresh top-30, and is what was causing
    # "Top Losers" to occasionally show empty/wrong (see incident 3 jul 2026).
    stale = _cache_get_stale(cache_key)
    if stale and (stale.get("gainers") or stale.get("losers")):
        logger.info("market crypto: serving stale cache after CoinGecko failure")
        # IMPORTANT: re-set the cache (refreshes its timestamp) even though
        # the data itself is unchanged. Without this, _cache_get(key, ttl)
        # in the route handler keeps seeing this entry as "expired" forever
        # once CoinGecko starts failing, so EVERY subsequent request (sidebar
        # polling, other open tabs, the 120s background refresher) re-enters
        # this function and re-hits CoinGecko instead of reusing the stale
        # copy — turning an occasional 429 into a request storm. Bug
        # introduced earlier tonight (3 jul 2026), fixed same night after it
        # showed up as a CoinGecko flood + OOM restart loop in Render logs.
        _cache_set(cache_key, stale)
        return stale

    # yfinance fallback — only reached if CoinGecko failed AND there's no
    # cache at all yet (e.g. right after a deploy/restart).
    crypto_universe = [
        ("BTC", "Bitcoin"), ("ETH", "Ethereum"), ("BNB", "BNB"), ("SOL", "Solana"), ("XRP", "XRP"),
        ("ADA", "Cardano"), ("DOGE", "Dogecoin"), ("TRX", "TRON"), ("AVAX", "Avalanche"), ("DOT", "Polkadot"),
        ("LINK", "Chainlink"), ("MATIC", "Polygon"), ("LTC", "Litecoin"), ("UNI", "Uniswap"), ("ATOM", "Cosmos"),
        ("ETC", "Ethereum Classic"), ("XLM", "Stellar"), ("XMR", "Monero"), ("BCH", "Bitcoin Cash"), ("APT", "Aptos"),
        ("ARB", "Arbitrum"), ("OP", "Optimism"), ("NEAR", "NEAR Protocol"), ("FIL", "Filecoin"), ("ICP", "Internet Computer"),
        ("INJ", "Injective"), ("TIA", "Celestia"), ("SUI", "Sui"), ("SEI", "Sei"), ("HBAR", "Hedera"),
    ]
    syms = [s for s, _ in crypto_universe]
    yf_syms = [f"{s}-USD" for s in syms]

    def _fetch():
        rows = []
        try:
            data = yf.download(yf_syms, period="2d", interval="1d", group_by="ticker", auto_adjust=False, progress=False, threads=True)
            for (sym, name) in crypto_universe:
                key = f"{sym}-USD"
                try:
                    df = data[key] if key in data.columns.get_level_values(0) else None
                    if df is None or df.empty or len(df) < 2:
                        continue
                    closes = df["Close"].dropna().tolist()
                    if len(closes) < 2:
                        continue
                    prev, last = float(closes[-2]), float(closes[-1])
                    if prev == 0:
                        continue
                    pct = (last - prev) / prev * 100.0
                    rows.append({
                        "symbol": sym,
                        "coingecko_id": name.lower().replace(" ", "-"),
                        "name": name,
                        "image": None,
                        "price_usd": last,
                        "change_24h": pct,
                        "market_cap_usd": None,
                        "volume_24h_usd": None,
                    })
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"market crypto yf err: {e}")
        return rows

    rows = await asyncio.to_thread(_fetch)
    rows.sort(key=lambda d: d["change_24h"], reverse=True)
    out["gainers"] = rows[:10]
    out["losers"] = sorted(rows, key=lambda d: d["change_24h"])[:10]
    _cache_set(cache_key, out)
    return out


_STOCK_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "AVGO", "JPM", "V", "WMT", "XOM", "UNH", "MA", "LLY", "JNJ", "PG", "ORCL", "COST",
    "HD", "ABBV", "MRK", "BAC", "PEP", "KO", "ADBE", "CSCO", "CRM", "TMO", "ACN", "NFLX", "AMD", "INTC", "DIS", "ABT", "WFC", "VZ", "PFE", "CMCSA",
    "QCOM", "TXN", "NKE", "IBM", "BA", "SBUX", "GE", "CAT", "HON", "PYPL", "UBER", "SHOP", "SQ", "COIN", "PLTR", "SOFI", "RIVN", "LCID", "NIO", "BABA",
    "F", "GM", "DAL", "UAL", "AAL", "T", "CVX", "XOM", "RBLX", "SNAP", "SPOT", "PINS", "ZM", "DOCU", "ROKU", "CRWD", "DDOG", "SNOW", "NET", "MDB",
    "TSM", "ASML", "JD", "PDD", "NU", "MELI", "NVAX", "MRNA", "BNTX", "ARM", "SMCI", "MU", "LRCX", "KLAC", "INTU", "NOW", "WDAY", "ZS", "PANW", "FTNT",
    "ABNB", "BKNG", "MAR", "HLT", "CMG", "MCD", "YUM", "KHC", "MO", "PM", "WBD", "PARA", "TTD",
]


@router.get("/market/movers/stocks")
async def market_movers_stocks():
    cache_key = "market_movers_stocks"
    cached = _cache_get(cache_key, ttl=MOVERS_STOCKS_TTL)
    if cached:
        return cached
    return await _fetch_movers_stocks()


async def _fetch_movers_stocks():
    """Actual fetch logic for stock movers, split out of the route handler —
    same reasoning as _fetch_movers_crypto() above. This is the slow one:
    yf.download() pulls ~100 tickers from Yahoo Finance in one batch, which
    routinely takes 10-20s. Without the background warmer, whoever's request
    lands after the TTL expires (or right after a cold Render restart) eats
    that full cost synchronously."""
    cache_key = "market_movers_stocks"

    def _fetch():
        rows = []
        try:
            data = yf.download(_STOCK_UNIVERSE, period="2d", interval="1d", group_by="ticker", auto_adjust=False, progress=False, threads=True)
            for s in _STOCK_UNIVERSE:
                try:
                    df = data[s] if s in data.columns.get_level_values(0) else None
                    if df is None or df.empty or len(df) < 2:
                        continue
                    closes = df["Close"].dropna().tolist()
                    if len(closes) < 2:
                        continue
                    prev, last = float(closes[-2]), float(closes[-1])
                    if prev == 0:
                        continue
                    pct = (last - prev) / prev * 100.0
                    rows.append({
                        "symbol": s,
                        "name": s,
                        "price_usd": last,
                        "change_24h": pct,
                    })
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"market stocks dl err: {e}")
        return rows

    rows = await asyncio.to_thread(_fetch)
    rows.sort(key=lambda d: d["change_24h"], reverse=True)
    out = {
        "gainers": rows[:10],
        "losers": sorted(rows, key=lambda d: d["change_24h"])[:10],
    }
    _cache_set(cache_key, out)
    return out


def _yf_news(sym, limit=8):
    try:
        t = yf.Ticker(sym)
        n = getattr(t, "news", []) or []
        out = []
        for x in n[:limit]:
            content = x.get("content") or {}
            title = content.get("title") or x.get("title")
            if not title:
                continue
            provider = (content.get("provider") or {}).get("displayName") or x.get("publisher") or ""
            url = (content.get("canonicalUrl") or {}).get("url") or x.get("link") or ""
            thumb_obj = content.get("thumbnail") or x.get("thumbnail") or {}
            res = thumb_obj.get("resolutions") or []
            thumb = res[0].get("url") if res else None
            pub = content.get("pubDate") or x.get("providerPublishTime")
            summary = content.get("summary") or x.get("summary", "")
            out.append({
                "id": x.get("id") or content.get("id") or title,
                "title": title,
                "link": url,
                "publisher": provider,
                "thumbnail": thumb,
                "ts": pub,
                "summary": summary,
                "symbol": sym.replace("-USD", ""),
            })
        return out
    except Exception as e:
        logger.warning(f"yf news {sym} err: {e}")
        return []


def _to_ts(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0


_NEWS_CRYPTO_SEEDS = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"]
_NEWS_STOCK_SEEDS = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN"]
LATEST_NEWS_TTL = 600


def _dedupe_sort_limit(items, n):
    by_title = {}
    for it in items:
        if it["title"] not in by_title:
            by_title[it["title"]] = it
    arr = list(by_title.values())
    arr.sort(key=lambda x: _to_ts(x.get("ts")), reverse=True)
    return arr[:n]


@router.get("/market/latest-news")
async def market_latest_news():
    cache_key = "market_latest_news"
    cached = _cache_get(cache_key, ttl=LATEST_NEWS_TTL)
    if cached:
        return cached
    return await _fetch_latest_news()


async def _fetch_latest_news():
    """Same reasoning as _fetch_movers_crypto/_fetch_movers_stocks above —
    global (not per-user) data, so it's cheap to keep warm in the
    background instead of making whoever's request lands after the 10-min
    TTL expires pay for ~11 separate yfinance news lookups synchronously."""
    cache_key = "market_latest_news"
    crypto_results, stock_results = await asyncio.gather(
        asyncio.gather(*[asyncio.to_thread(_yf_news, s) for s in _NEWS_CRYPTO_SEEDS]),
        asyncio.gather(*[asyncio.to_thread(_yf_news, s) for s in _NEWS_STOCK_SEEDS]),
    )
    crypto_flat = [n for arr in crypto_results for n in arr]
    stock_flat = [n for arr in stock_results for n in arr]

    out = {
        "crypto": _dedupe_sort_limit(crypto_flat, 7),
        "stocks": _dedupe_sort_limit(stock_flat, 7),
    }
    _cache_set(cache_key, out)
    return out


@router.get("/market/portfolio-news")
async def market_portfolio_news(user=Depends(get_current_user)):
    cache_key = f"portfolio_news:{user['id']}"
    cached = _cache_get(cache_key, ttl=600)
    if cached:
        return cached

    txs = await db.transactions.find(
        {"user_id": user["id"]},
        {"_id": 0, "symbol": 1, "asset_type": 1, "coingecko_id": 1},
    ).to_list(2000)
    seen = set()
    distinct = []
    for tx in txs:
        key = (tx["asset_type"], tx["symbol"].upper())
        if key in seen:
            continue
        seen.add(key)
        distinct.append(tx)
    distinct = distinct[:6]

    results = await asyncio.gather(*[
        asyncio.to_thread(_yf_news, (d["symbol"] + "-USD") if d["asset_type"] == "crypto" else d["symbol"], 5)
        for d in distinct
    ])
    flat = [n for arr in results for n in arr]
    by_title = {}
    for n in flat:
        if n["title"] not in by_title:
            by_title[n["title"]] = n
    items = list(by_title.values())
    items.sort(key=lambda x: _to_ts(x.get("ts")), reverse=True)
    items = items[:5]
    _cache_set(cache_key, items)
    return items


# Refresh interval kept comfortably under both TTLs above, so a request
# almost never lands on an expired cache entry and has to pay the full
# fetch cost itself (the stocks fetch alone routinely takes 10-20s — see
# _fetch_movers_stocks() docstring). Same background-loop pattern as
# alert_checker.run_alert_checker() and portfolio.run_snapshot_scheduler().
# 15 min (bumped from 2 min on 3 jul 2026, same incident as the TTL bump
# above) — this is also the number shown to the user next to "Crypto · 24h"
# / "Stocks · Today" on the Mercado page ("Atualizado a cada 15 min" —
# market.updated_every in I18nContext.jsx). If you change this value, update
# that translated copy too, in all 6 languages.
# ---------------------------------------------------------------------------
# Sentimento do mercado (manómetro / needle gauge) — cripto + ações.
# Cripto: alternative.me Crypto Fear & Greed Index (gratuito, sem chave,
#   atualiza 1x/dia). Ações: CNN Fear & Greed Index (endpoint de dados
#   nao-oficial usado pelo widget do site da CNN; requer User-Agent de
#   browser). Ambos degradam com graciosidade — se uma fonte falhar,
#   servimos o ultimo valor em cache (stale) e, se nem isso houver,
#   available=false para o front esconder/assinalar esse mostrador em vez
#   de rebentar. TTL 30 min: os indices so mudam de hora a hora / diariamente,
#   portanto nao ha vantagem em bater as APIs com mais frequencia.
# ---------------------------------------------------------------------------
SENTIMENT_TTL = 1800  # 30 min


def _classify_sentiment(score: int) -> str:
    """Normaliza um score 0-100 numa das 5 classificacoes canonicas usadas
    por ambos os indices (Extreme Fear ... Extreme Greed). O front traduz
    estas chaves; nao mostrar texto em ingles diretamente."""
    if score <= 24:
        return "extreme_fear"
    if score <= 44:
        return "fear"
    if score <= 55:
        return "neutral"
    if score <= 74:
        return "greed"
    return "extreme_greed"


async def _fetch_sentiment_crypto():
    """Crypto Fear & Greed via alternative.me. Devolve dict ou None."""
    try:
        async with httpx.AsyncClient(timeout=12) as ch:
            r = await ch.get("https://api.alternative.me/fng/", params={"limit": 1})
            r.raise_for_status()
            data = (r.json() or {}).get("data") or []
            if not data:
                return None
            score = int(float(data[0].get("value")))
            score = max(0, min(100, score))
            return {"score": score, "classification": _classify_sentiment(score),
                    "available": True}
    except Exception as e:
        logger.warning(f"Crypto sentiment fetch failed: {e}")
        return None


async def _fetch_sentiment_stocks():
    """Stock Fear & Greed via CNN (endpoint de dados nao-oficial). Devolve
    dict ou None. Precisa de um User-Agent de browser ou a CNN devolve 418."""
    try:
        headers = {
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/125.0 Safari/537.36"),
            "Accept": "application/json, text/plain, */*",
        }
        async with httpx.AsyncClient(timeout=12, headers=headers) as ch:
            r = await ch.get(
                "https://production.dataviz.cnn.io/index/fearandgreed/graphdata")
            r.raise_for_status()
            fg = (r.json() or {}).get("fear_and_greed") or {}
            if fg.get("score") is None:
                return None
            score = max(0, min(100, int(round(float(fg.get("score"))))))
            return {"score": score, "classification": _classify_sentiment(score),
                    "available": True}
    except Exception as e:
        logger.warning(f"Stocks sentiment fetch failed: {e}")
        return None


async def _fetch_sentiment():
    """Junta cripto + acoes com cache e fallback stale por-mostrador."""
    cache_key = "market_sentiment"
    crypto, stocks = await asyncio.gather(
        _fetch_sentiment_crypto(), _fetch_sentiment_stocks())
    prev = _cache_get_stale(cache_key) or {}
    if crypto is None:
        crypto = {**(prev.get("crypto") or {"score": None, "classification": None}),
                  "available": False}
    if stocks is None:
        stocks = {**(prev.get("stocks") or {"score": None, "classification": None}),
                  "available": False}
    out = {"crypto": crypto, "stocks": stocks}
    # So gravamos em cache "fresca" se pelo menos uma fonte respondeu ao vivo,
    # para nao carimbar dados stale como frescos e esconder falhas persistentes.
    if crypto.get("available") or stocks.get("available"):
        _cache_set(cache_key, out)
    return out


@router.get("/market/sentiment")
async def market_sentiment():
    """Manometro de sentimento: cripto (alternative.me) + acoes (CNN)."""
    cache_key = "market_sentiment"
    cached = _cache_get(cache_key, ttl=SENTIMENT_TTL)
    if cached:
        return cached
    return await _fetch_sentiment()


MARKET_REFRESH_INTERVAL_SECONDS = 900


async def run_market_movers_refresher() -> None:
    """Background loop — call once from FastAPI startup (server.py). Keeps
    the Market tab's movers cache warm regardless of whether anyone is
    looking at it, so the ~20s cold-cache cost (mostly yfinance's batch
    download of ~100 stock tickers) is paid here in the background instead
    of by whichever user's request happens to land after the TTL expires.
    Doesn't help the very first request after a cold Render restart — this
    loop only starts warming once the process is up — but it eliminates the
    far more common "cache just expired" case."""
    logger.info(f"Market movers refresher started (interval={MARKET_REFRESH_INTERVAL_SECONDS}s)")
    # News has a longer TTL (10 min) than the movers (2-4 min) — only warm
    # it roughly every 5th tick instead of every tick, so it isn't refetched
    # far more often than its own cache would ever actually expire.
    NEWS_EVERY_N_TICKS = max(1, round(LATEST_NEWS_TTL / MARKET_REFRESH_INTERVAL_SECONDS))
    tick = 0
    while True:
        try:
            await _fetch_movers_crypto()
        except Exception as e:
            logger.warning(f"Market movers refresher (crypto) failed: {e}")
        try:
            await _fetch_movers_stocks()
        except Exception as e:
            logger.warning(f"Market movers refresher (stocks) failed: {e}")
        if tick % NEWS_EVERY_N_TICKS == 0:
            try:
                await _fetch_latest_news()
            except Exception as e:
                logger.warning(f"Market movers refresher (news) failed: {e}")
            try:
                await _fetch_sentiment()
            except Exception as e:
                logger.warning(f"Market movers refresher (sentiment) failed: {e}")
        tick += 1
        await asyncio.sleep(MARKET_REFRESH_INTERVAL_SECONDS)

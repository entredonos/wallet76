"""Sentimento do mercado (Fear & Greed) — cripto (alternative.me) + ações (CNN).

Extraído de routes/market.py: quando a camada de "dados de mercado" (notícias,
movers, watchlists) foi cortada, o router `market` deixou de ser registado,
mas o widget de sentimento do dashboard continuou a existir e a chamar
/market/sentiment. Este router mínimo mantém esse endpoint vivo sem
ressuscitar o resto da camada cortada. Degrada com graciosidade: se uma fonte
falhar, serve o último valor em cache (stale); se nem isso, available=false.
"""
import asyncio

import httpx
from fastapi import APIRouter

from core import _cache_get, _cache_set, _cache_get_stale, logger

router = APIRouter()

SENTIMENT_TTL = 1800  # 30 min


def _classify_sentiment(score: int) -> str:
    """Normaliza um score 0-100 numa das 5 classificações canónicas (o front
    traduz estas chaves; não mostrar texto em inglês diretamente)."""
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
            return {"score": score, "classification": _classify_sentiment(score), "available": True}
    except Exception as e:
        logger.warning(f"Crypto sentiment fetch failed: {e}")
        return None


async def _fetch_sentiment_stocks():
    """Stock Fear & Greed via CNN (endpoint não-oficial; precisa de um
    User-Agent de browser ou a CNN devolve 418). Devolve dict ou None."""
    try:
        headers = {
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/125.0 Safari/537.36"),
            "Accept": "application/json, text/plain, */*",
        }
        async with httpx.AsyncClient(timeout=12, headers=headers) as ch:
            r = await ch.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata")
            r.raise_for_status()
            fg = (r.json() or {}).get("fear_and_greed") or {}
            if fg.get("score") is None:
                return None
            score = max(0, min(100, int(round(float(fg.get("score"))))))
            return {"score": score, "classification": _classify_sentiment(score), "available": True}
    except Exception as e:
        logger.warning(f"Stocks sentiment fetch failed: {e}")
        return None


async def _fetch_sentiment():
    """Junta cripto + ações, com cache e fallback stale por-mostrador."""
    cache_key = "market_sentiment"
    crypto, stocks = await asyncio.gather(
        _fetch_sentiment_crypto(), _fetch_sentiment_stocks())
    prev = _cache_get_stale(cache_key) or {}
    if crypto is None:
        crypto = {**(prev.get("crypto") or {"score": None, "classification": None}), "available": False}
    if stocks is None:
        stocks = {**(prev.get("stocks") or {"score": None, "classification": None}), "available": False}
    out = {"crypto": crypto, "stocks": stocks}
    # Só grava cache "fresca" se pelo menos uma fonte respondeu ao vivo, para
    # não carimbar dados stale como frescos e esconder falhas persistentes.
    if crypto.get("available") or stocks.get("available"):
        _cache_set(cache_key, out)
    return out


@router.get("/market/sentiment")
async def market_sentiment():
    """Manómetro de sentimento: cripto (alternative.me) + ações (CNN)."""
    cache_key = "market_sentiment"
    cached = _cache_get(cache_key, ttl=SENTIMENT_TTL)
    if cached:
        return cached
    return await _fetch_sentiment()

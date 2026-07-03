"""Binance connector — official REST API v3.

Auth: API Key (header X-MBX-APIKEY) + HMAC-SHA256 signed requests.
The key must have read-only "Spot & Margin Trading" permission.

Strategy:
  1. GET /api/v3/account → list all assets with any balance
  2. For each asset, fetch trades for {ASSET}USDT and {ASSET}BTC pairs
  3. Map to internal format (convert BTC-priced trades via BTC/USDT rate)

Credentials stored: encrypted api_key + encrypted api_secret.
"""
import asyncio
import hashlib
import hmac
import time
from datetime import date
from urllib.parse import urlencode

import httpx

BASE = "https://api.binance.com"
HEADERS_BASE = {"User-Agent": "Wallet76/1.0"}

# Common quote assets to try per base asset
QUOTE_ASSETS = ["USDT", "BUSD", "BTC", "ETH", "BNB"]

# Stablecoins we skip as "base" (no point fetching USDT trades)
STABLECOINS = {"USDT", "BUSD", "USDC", "TUSD", "DAI", "FDUSD", "USDP"}


class BinanceError(Exception):
    pass


def _sign(params: dict, secret: str) -> str:
    query = urlencode(params)
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def _signed_params(extra: dict, secret: str) -> dict:
    params = {**extra, "timestamp": int(time.time() * 1000)}
    params["signature"] = _sign(params, secret)
    return params


async def _get(client: httpx.AsyncClient, path: str, api_key: str, secret: str, extra: dict | None = None) -> dict:
    params = _signed_params(extra or {}, secret)
    r = await client.get(
        f"{BASE}{path}",
        params=params,
        headers={**HEADERS_BASE, "X-MBX-APIKEY": api_key},
    )
    if r.status_code == 401:
        raise BinanceError("Invalid Binance API key or signature")
    if r.status_code == 403:
        raise BinanceError("Binance API key lacks required permissions (need Spot read)")
    if not r.is_success:
        msg = r.json().get("msg", r.text) if r.headers.get("content-type", "").startswith("application/json") else r.text
        raise BinanceError(f"Binance API error {r.status_code}: {msg}")
    return r.json()


def _map_trade(trade: dict, symbol: str, base: str, quote: str, btc_usdt: float) -> dict | None:
    """Map a Binance trade to our internal format."""
    is_buyer = trade.get("isBuyer", False)
    qty = abs(float(trade.get("qty") or 0))
    price = abs(float(trade.get("price") or 0))
    commission = abs(float(trade.get("commission") or 0))
    commission_asset = trade.get("commissionAsset") or ""
    ts = trade.get("time") or 0

    if qty == 0 or price == 0:
        return None

    # Convert price to USD
    if quote == "USDT" or quote == "BUSD" or quote == "USDC":
        price_usd = price
        fee_usd = commission if commission_asset in ("USDT", "BUSD", "USDC") else 0.0
    elif quote == "BTC":
        price_usd = price * btc_usdt
        fee_usd = commission * btc_usdt if commission_asset == "BTC" else 0.0
    else:
        price_usd = price   # best effort
        fee_usd = 0.0

    trade_date = date.fromtimestamp(ts / 1000).isoformat() if ts else date.today().isoformat()

    return {
        "symbol": base.upper(),
        "name": base.upper(),
        "asset_type": "crypto",
        "type": "BUY" if is_buyer else "SELL",
        "date": trade_date,
        "quantity": qty,
        "price_usd": price_usd,
        "price_currency": "USD",
        "fee": fee_usd,
        "fee_currency": "USD",
        "notes": f"Binance import · {symbol} · ID {trade.get('id', '')}",
        "_broker_id": f"binance_{symbol}_{trade.get('id', '')}",
        "_broker": "binance",
    }


# Cap on concurrent myTrades requests. Binance weighs this endpoint against
# a shared per-key rate limit, so this isn't unbounded — just no longer
# fully serial (one asset × quote pair at a time), which for accounts
# holding many assets could previously take a long time (N_assets × 5
# sequential round-trips).
_TRADES_CONCURRENCY = 5


async def fetch_transactions(api_key: str, api_secret: str) -> list[dict]:
    """Fetch all spot trades from Binance."""
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Get account info → find non-zero assets
        account = await _get(client, "/api/v3/account", api_key, api_secret)
        balances = account.get("balances") or []
        assets = {
            b["asset"]
            for b in balances
            if float(b.get("free", 0)) + float(b.get("locked", 0)) > 0
            and b["asset"] not in STABLECOINS
        }

        # 2. Get BTC/USDT rate for conversion
        r_btc = await client.get(f"{BASE}/api/v3/ticker/price", params={"symbol": "BTCUSDT"})
        btc_usdt = float(r_btc.json().get("price", 50000)) if r_btc.is_success else 50000.0

        # 3. Fetch trades per asset × quote pair, with bounded concurrency
        sem = asyncio.Semaphore(_TRADES_CONCURRENCY)

        async def _fetch_pair(asset: str, quote: str) -> list[dict]:
            symbol = f"{asset}{quote}"
            async with sem:
                try:
                    params = _signed_params({"symbol": symbol, "limit": 1000}, api_secret)
                    r = await client.get(
                        f"{BASE}/api/v3/myTrades",
                        params=params,
                        headers={**HEADERS_BASE, "X-MBX-APIKEY": api_key},
                    )
                    if r.status_code == 400 or not r.is_success:
                        return []   # pair doesn't exist / request failed
                    return [
                        m for trade in r.json()
                        if (m := _map_trade(trade, symbol, asset, quote, btc_usdt))
                    ]
                except Exception:
                    return []

        pair_results = await asyncio.gather(*(
            _fetch_pair(asset, quote)
            for asset in sorted(assets)
            for quote in QUOTE_ASSETS
        ))
        for r in pair_results:
            results.extend(r)

    return results


async def validate_credentials(api_key: str, api_secret: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await _get(client, "/api/v3/account", api_key, api_secret)
        return True
    except BinanceError:
        return False

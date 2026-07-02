"""Kraken connector — official REST API.

Auth: API-Key header + API-Sign (HMAC-SHA512 of nonce + POST body).
The key must have "Query Funds" and "Query open/closed orders & trades" permissions.

Docs: https://docs.kraken.com/api/docs/rest-api/get-trade-history

Credentials stored: encrypted api_key + encrypted api_secret (base64).
"""
import base64
import hashlib
import hmac
import time
import urllib.parse
from datetime import date, datetime, timezone

import httpx

BASE = "https://api.kraken.com"
HEADERS_BASE = {"User-Agent": "Wallet76/1.0", "Content-Type": "application/x-www-form-urlencoded"}

# Kraken asset name → clean symbol mapping
KRAKEN_ASSET_MAP = {
    "XXBT": "BTC", "XBT": "BTC",
    "XETH": "ETH", "XXRP": "XRP",
    "XLTC": "LTC", "XXLM": "XLM",
    "XDOT": "DOT", "XXMR": "XMR",
    "ZEUR": "EUR", "ZUSD": "USD",
    "ZCAD": "CAD", "ZGBP": "GBP",
    "ZJPY": "JPY",
}

STABLECOINS = {"USD", "EUR", "GBP", "CAD", "JPY", "USDT", "USDC", "DAI", "ZUSD", "ZEUR"}


class KrakenError(Exception):
    pass


def _sign(path: str, data: str, secret: str, nonce: int) -> str:
    """Kraken HMAC-SHA512 signature."""
    post_data = str(nonce) + data
    sha256_hash = hashlib.sha256(post_data.encode()).digest()
    hmac_data = path.encode() + sha256_hash
    decoded_secret = base64.b64decode(secret)
    signature = hmac.new(decoded_secret, hmac_data, hashlib.sha512)
    return base64.b64encode(signature.digest()).decode()


async def _private_post(
    client: httpx.AsyncClient,
    path: str,
    api_key: str,
    api_secret: str,
    params: dict | None = None,
) -> dict:
    nonce = int(time.time() * 1000)
    data = {"nonce": str(nonce), **(params or {})}
    body = urllib.parse.urlencode(data)
    sig = _sign(path, body, api_secret, nonce)

    r = await client.post(
        f"{BASE}{path}",
        content=body,
        headers={
            **HEADERS_BASE,
            "API-Key": api_key,
            "API-Sign": sig,
        },
    )
    r.raise_for_status()
    resp = r.json()
    errors = resp.get("error") or []
    if errors:
        raise KrakenError(f"Kraken API error: {', '.join(errors)}")
    return resp.get("result") or {}


def _clean_symbol(kraken_sym: str) -> str:
    """Convert Kraken asset name to clean symbol."""
    return KRAKEN_ASSET_MAP.get(kraken_sym, kraken_sym.lstrip("X").lstrip("Z"))


def _parse_pair(pair: str) -> tuple[str, str]:
    """Parse Kraken pair (e.g. XXBTZUSD) into (base, quote)."""
    # Try known quote currencies
    for q in ["USDT", "USD", "EUR", "BTC", "XBT", "ETH", "GBP", "CAD"]:
        if pair.endswith(q) or pair.endswith(f"Z{q}") or pair.endswith(f"X{q}"):
            base_raw = pair[: -(len(q) + (1 if pair[-(len(q)+1)] in "XZ" else 0))] if pair[-(len(q)+1):-(len(q))] in ("X","Z") else pair[:-len(q)]
            return _clean_symbol(base_raw), _clean_symbol(q)
    # Fallback: split at midpoint
    mid = len(pair) // 2
    return _clean_symbol(pair[:mid]), _clean_symbol(pair[mid:])


def _map_trade(trade_id: str, t: dict) -> dict | None:
    """Map a Kraken trade to our internal format."""
    trade_type = (t.get("type") or "").upper()   # "buy" / "sell"
    if trade_type not in ("BUY", "SELL"):
        return None

    order_type = (t.get("ordertype") or "").lower()
    pair = t.get("pair") or ""
    vol = float(t.get("vol") or 0)
    price = float(t.get("price") or 0)
    cost = float(t.get("cost") or 0)
    fee = float(t.get("fee") or 0)
    ts = float(t.get("time") or 0)

    if vol == 0 or not pair:
        return None

    base, quote = _parse_pair(pair)
    if base in STABLECOINS:
        return None   # skip stable-stable trades

    price_usd = price if quote in ("USD", "USDT", "USDC") else (cost / vol if vol else price)
    trade_date = date.fromtimestamp(ts).isoformat() if ts else date.today().isoformat()

    return {
        "symbol": base,
        "name": base,
        "asset_type": "crypto",
        "type": trade_type,
        "date": trade_date,
        "quantity": vol,
        "price_usd": price_usd,
        "price_currency": quote,
        "fee": fee,
        "fee_currency": quote,
        "notes": f"Kraken import · {pair} · {trade_id}",
        "_broker_id": f"kraken_{trade_id}",
        "_broker": "kraken",
    }


async def fetch_transactions(api_key: str, api_secret: str) -> list[dict]:
    """Fetch full trade history from Kraken (paginated by offset)."""
    results = []
    offset = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            data = await _private_post(
                client,
                "/0/private/TradesHistory",
                api_key, api_secret,
                {"ofs": str(offset)},
            )
            trades = data.get("trades") or {}
            count = data.get("count") or 0

            for trade_id, trade in trades.items():
                m = _map_trade(trade_id, trade)
                if m:
                    results.append(m)

            offset += len(trades)
            if offset >= count or not trades:
                break

    return results


async def validate_credentials(api_key: str, api_secret: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            result = await _private_post(client, "/0/private/Balance", api_key, api_secret)
            return isinstance(result, dict)
    except KrakenError:
        return False

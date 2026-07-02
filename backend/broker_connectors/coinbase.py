"""Coinbase Advanced Trade connector (v3 API).

Auth: API Key Name + Private Key (EC or RSA) — JWT-based (new as of 2024).
Fallback: legacy API Key + Secret + Passphrase for older keys.

The user creates a "Cloud API Trading Key" at
  https://www.coinbase.com/settings/api
with read-only permissions.

New format (2024+): key_name (starts with "organizations/") + private_key (PEM).
Legacy format:       api_key + api_secret + passphrase.

We auto-detect by checking if api_key starts with "organizations/".

Credentials stored: encrypted api_key + encrypted api_secret (+ passphrase if legacy).
"""
import base64
import hashlib
import hmac
import json
import time
from datetime import date, datetime, timezone

import httpx

BASE = "https://api.coinbase.com"
HEADERS_BASE = {"User-Agent": "Wallet76/1.0", "Content-Type": "application/json"}


class CoinbaseError(Exception):
    pass


# ── JWT auth (new Coinbase CDP keys) ─────────────────────────────────────────
def _build_jwt(key_name: str, private_key_pem: str, method: str, path: str) -> str:
    """Build a JWT for Coinbase Advanced Trade API (new CDP key format)."""
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
        from cryptography.hazmat.primitives.hashes import SHA256
        import secrets as _secrets

        private_key = load_pem_private_key(private_key_pem.encode(), password=None)
        header = {"alg": "ES256", "kid": key_name}
        payload = {
            "sub": key_name,
            "iss": "cdp",
            "nbf": int(time.time()),
            "exp": int(time.time()) + 120,
            "uri": f"{method} api.coinbase.com{path}",
        }

        def b64url(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

        h = b64url(json.dumps(header).encode())
        p = b64url(json.dumps(payload).encode())
        signing_input = f"{h}.{p}".encode()

        sig = private_key.sign(signing_input, ECDSA(SHA256()))
        # DER → raw R+S (64 bytes)
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
        r, s = decode_dss_signature(sig)
        raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
        return f"{h}.{p}.{b64url(raw_sig)}"

    except ImportError:
        raise CoinbaseError("cryptography package required for Coinbase JWT auth")


# ── Legacy HMAC auth (Coinbase Pro / old Advanced Trade keys) ─────────────────
def _legacy_headers(api_key: str, api_secret: str, passphrase: str, method: str, path: str, body: str = "") -> dict:
    ts = str(int(time.time()))
    msg = ts + method.upper() + path + body
    sig = base64.b64encode(
        hmac.new(base64.b64decode(api_secret), msg.encode(), hashlib.sha256).digest()
    ).decode()
    return {
        **HEADERS_BASE,
        "CB-ACCESS-KEY": api_key,
        "CB-ACCESS-SIGN": sig,
        "CB-ACCESS-TIMESTAMP": ts,
        "CB-ACCESS-PASSPHRASE": passphrase,
    }


def _is_jwt_key(api_key: str) -> bool:
    return api_key.startswith("organizations/")


def _map_fill(fill: dict) -> dict | None:
    """Map a Coinbase fill/order to internal format."""
    side = (fill.get("side") or "").upper()
    if side not in ("BUY", "SELL"):
        return None

    # Try fill fields first, then order fields
    qty = float(fill.get("size") or fill.get("base_size") or fill.get("filled_size") or 0)
    price = float(fill.get("price") or fill.get("average_filled_price") or 0)
    product = fill.get("product_id") or fill.get("symbol") or ""  # e.g. "BTC-USD"
    fee = float(fill.get("commission") or fill.get("total_fees") or 0)

    # Parse symbol from product_id
    parts = product.split("-")
    base = parts[0] if parts else product
    quote = parts[1] if len(parts) > 1 else "USD"

    if qty == 0 or not base:
        return None

    # Price already in quote currency (usually USD)
    price_usd = price if quote in ("USD", "USDC", "USDT") else price

    ts = fill.get("trade_time") or fill.get("created_time") or fill.get("done_date") or ""
    if ts:
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            trade_date = dt.date().isoformat()
        except Exception:
            trade_date = ts[:10]
    else:
        trade_date = date.today().isoformat()

    fill_id = fill.get("trade_id") or fill.get("order_id") or fill.get("id") or ""

    return {
        "symbol": base.upper(),
        "name": base.upper(),
        "asset_type": "crypto",
        "type": side,
        "date": trade_date,
        "quantity": qty,
        "price_usd": price_usd,
        "price_currency": quote,
        "fee": fee,
        "fee_currency": quote,
        "notes": f"Coinbase import · {product} · {fill_id}",
        "_broker_id": f"coinbase_{fill_id}",
        "_broker": "coinbase",
    }


async def fetch_transactions(
    api_key: str,
    api_secret: str,
    passphrase: str = "",
) -> list[dict]:
    """Fetch all fills from Coinbase Advanced Trade."""
    results = []
    is_jwt = _is_jwt_key(api_key)

    async with httpx.AsyncClient(timeout=30) as client:
        if is_jwt:
            # New CDP key — use v3 fills endpoint
            path = "/api/v3/brokerage/orders/historical/fills"
            cursor = None
            while True:
                params = {"limit": 100}
                if cursor:
                    params["cursor"] = cursor
                token = _build_jwt(api_key, api_secret, "GET", path)
                r = await client.get(
                    f"{BASE}{path}",
                    params=params,
                    headers={**HEADERS_BASE, "Authorization": f"Bearer {token}"},
                )
                if not r.is_success:
                    raise CoinbaseError(f"Coinbase API error {r.status_code}: {r.text[:200]}")
                data = r.json()
                fills = data.get("fills") or []
                for f in fills:
                    m = _map_fill(f)
                    if m:
                        results.append(m)
                cursor = data.get("cursor")
                if not cursor or not fills:
                    break

        else:
            # Legacy HMAC key — use /fills endpoint
            path = "/fills"
            for page in range(1, 51):   # max 50 pages × 100 = 5000 fills
                headers = _legacy_headers(api_key, api_secret, passphrase, "GET", path)
                r = await client.get(
                    f"https://api.exchange.coinbase.com{path}",
                    params={"limit": 100, "after": page * 100 if page > 1 else None},
                    headers=headers,
                )
                if not r.is_success:
                    raise CoinbaseError(f"Coinbase legacy API error {r.status_code}: {r.text[:200]}")
                fills = r.json()
                if not fills:
                    break
                for f in fills:
                    m = _map_fill(f)
                    if m:
                        results.append(m)
                if len(fills) < 100:
                    break

    return results


async def validate_credentials(api_key: str, api_secret: str, passphrase: str = "") -> bool:
    is_jwt = _is_jwt_key(api_key)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if is_jwt:
                path = "/api/v3/brokerage/accounts"
                token = _build_jwt(api_key, api_secret, "GET", path)
                r = await client.get(
                    f"{BASE}{path}",
                    headers={**HEADERS_BASE, "Authorization": f"Bearer {token}"},
                )
            else:
                path = "/accounts"
                headers = _legacy_headers(api_key, api_secret, passphrase, "GET", path)
                r = await client.get(f"https://api.exchange.coinbase.com{path}", headers=headers)
            return r.status_code == 200
    except Exception:
        return False

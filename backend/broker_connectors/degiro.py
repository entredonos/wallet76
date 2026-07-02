"""DEGIRO connector — unofficial REST API.

Auth flow:
  1. POST /login/secure/login  → session cookie + intAccount
  2. GET  /reporting/secure/v4/transactions  → list of trades

Credentials stored: encrypted username + encrypted password.
Session is re-established on every sync (DEGIRO sessions expire).
"""
import asyncio
from datetime import datetime, date, timezone
from typing import Any

import httpx

BASE = "https://trader.degiro.nl"
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}


class DeGiroError(Exception):
    pass


async def _login(username: str, password: str) -> tuple[httpx.Cookies, str]:
    """Returns (cookies, intAccount)."""
    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        r = await client.post(
            f"{BASE}/login/secure/login",
            json={
                "username": username,
                "password": password,
                "isPassCodeReset": False,
                "isRedirectToMobile": False,
            },
        )
        if r.status_code != 200:
            raise DeGiroError(f"DEGIRO login failed: {r.status_code}")

        data = r.json()
        if data.get("status") != 0:
            msg = data.get("statusText") or "Login failed"
            raise DeGiroError(f"DEGIRO: {msg}")

        cookies = r.cookies

        # Fetch client info to get intAccount
        r2 = await client.get(f"{BASE}/pa/secure/client", cookies=cookies)
        r2.raise_for_status()
        int_account = str(r2.json()["data"]["intAccount"])

        return cookies, int_account


def _parse_date(val: Any) -> str:
    """DEGIRO returns dates as {'day':d,'month':m,'year':y} or ISO string."""
    if isinstance(val, str):
        return val[:10]
    if isinstance(val, dict):
        return date(val["year"], val["month"], val["day"]).isoformat()
    return str(val)


def _map_transaction(t: dict) -> dict | None:
    """Map a DEGIRO transaction to our internal format. Returns None to skip."""
    # buysell: "B" = buy, "S" = sell
    side = t.get("buysell", "")
    if side not in ("B", "S"):
        return None

    qty = abs(float(t.get("quantity") or 0))
    price = abs(float(t.get("price") or 0))
    fee = abs(float(t.get("totalFeesInBaseCurrency") or t.get("feeInBaseCurrency") or 0))
    currency = t.get("currency") or "EUR"

    # Convert price to USD if needed (caller should pass fx_rates)
    return {
        "symbol": (t.get("productSymbol") or t.get("symbol") or "").upper().strip(),
        "name": t.get("productName") or "",
        "asset_type": "stock",  # DEGIRO is stocks/ETFs only
        "type": "BUY" if side == "B" else "SELL",
        "date": _parse_date(t.get("date") or t.get("transactionDate") or ""),
        "quantity": qty,
        "price_usd": price,          # in transaction currency; caller converts
        "price_currency": currency,
        "fee": fee,
        "fee_currency": "EUR",       # DEGIRO charges in EUR
        "notes": f"DEGIRO import · ID {t.get('id', '')}",
        "_broker_id": str(t.get("id", "")),
        "_broker": "degiro",
    }


async def fetch_transactions(
    username: str,
    password: str,
    from_date: str = "2015-01-01",
    to_date: str | None = None,
) -> list[dict]:
    """Authenticate and return mapped transactions."""
    if to_date is None:
        to_date = date.today().isoformat()

    cookies, int_account = await _login(username, password)

    params = {
        "fromDate": from_date.replace("-", "/"),
        "toDate": to_date.replace("-", "/"),
        "groupTransactionsByOrder": "false",
        "intAccount": int_account,
        "sessionId": cookies.get("JSESSIONID", ""),
    }

    async with httpx.AsyncClient(headers=HEADERS, timeout=30) as client:
        r = await client.get(
            f"{BASE}/reporting/secure/v4/transactions",
            params=params,
            cookies=cookies,
        )
        r.raise_for_status()
        raw = r.json().get("data") or []

    mapped = []
    for t in raw:
        m = _map_transaction(t)
        if m and m["symbol"] and m["quantity"] > 0:
            mapped.append(m)
    return mapped


async def validate_credentials(username: str, password: str) -> bool:
    """Returns True if credentials are valid (login succeeds)."""
    try:
        await _login(username, password)
        return True
    except DeGiroError:
        return False

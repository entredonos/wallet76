"""Trading 212 connector — official REST API (v0).

Auth: Bearer API key (user generates in T212 app: Settings → API)
Docs: https://t212public-api-docs.redoc.ly/

We fetch:
  - /api/v0/equity/history/orders   (executed orders)

Credentials stored: encrypted api_key.
"""
import httpx
from datetime import date, datetime, timezone

BASE_LIVE  = "https://live.trading212.com"
BASE_PAPER = "https://demo.trading212.com"
HEADERS = {"User-Agent": "Wallet76/1.0"}


class T212Error(Exception):
    pass


def _base(is_paper: bool) -> str:
    return BASE_PAPER if is_paper else BASE_LIVE


def _map_order(order: dict) -> dict | None:
    """Map a T212 filled order to our internal format."""
    status = order.get("status") or ""
    if status != "FILLED":
        return None

    side = order.get("type") or ""          # "BUY" / "SELL" / "LIMIT_BUY" etc.
    is_buy = "BUY" in side.upper()
    is_sell = "SELL" in side.upper()
    if not (is_buy or is_sell):
        return None

    qty = abs(float(order.get("filledQuantity") or order.get("quantity") or 0))
    price = abs(float(order.get("filledPrice") or order.get("limitPrice") or 0))
    filled_at = order.get("dateExecuted") or order.get("dateModified") or ""
    date_str = filled_at[:10] if filled_at else date.today().isoformat()

    ticker = (order.get("ticker") or "").upper().strip()
    # T212 tickers sometimes have _US / _EQ suffix
    symbol = ticker.split("_")[0] if "_" in ticker else ticker

    # T212 doesn't give commission per order in the history endpoint
    fee = 0.0

    if not symbol or qty == 0:
        return None

    return {
        "symbol": symbol,
        "name": order.get("instrumentName") or symbol,
        "asset_type": "stock",
        "type": "BUY" if is_buy else "SELL",
        "date": date_str,
        "quantity": qty,
        "price_usd": price,
        "price_currency": order.get("currencyCode") or "USD",
        "fee": fee,
        "fee_currency": "USD",
        "notes": f"T212 import · {order.get('orderId') or order.get('id', '')}",
        "_broker_id": str(order.get("orderId") or order.get("id") or ""),
        "_broker": "trading212",
    }


async def fetch_transactions(api_key: str, is_paper: bool = False) -> list[dict]:
    """Fetch all filled orders from Trading 212."""
    base = _base(is_paper)
    headers = {**HEADERS, "Authorization": api_key}
    results = []
    cursor = None   # pagination cursor (order id)

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            params: dict = {"limit": 50}
            if cursor:
                params["cursor"] = cursor

            r = await client.get(
                f"{base}/api/v0/equity/history/orders",
                headers=headers,
                params=params,
            )

            if r.status_code == 401:
                raise T212Error("Invalid Trading 212 API key")
            if r.status_code == 403:
                raise T212Error("API key lacks permission to read order history")
            r.raise_for_status()

            data = r.json()
            # Correção (16 jul 2026) — a precedência de operadores tornava isto
            # `(data.get("items") or data) if isinstance(data, list) else []`.
            # A API do T212 devolve um dict {"items": [...]}, logo isinstance(
            # data, list) era False e `items` ficava SEMPRE []: toda a sync do
            # Trading212 reportava "0 importadas". Agora tratamos o dict (caso
            # real) e uma eventual lista à parte, sem depender da precedência.
            if isinstance(data, dict):
                items = data.get("items", [])
            elif isinstance(data, list):
                items = data
            else:
                items = []

            for order in items:
                m = _map_order(order)
                if m and m["quantity"] > 0:
                    results.append(m)

            # T212 pagination: next cursor is the last order's id
            if len(items) < 50:
                break
            cursor = items[-1].get("orderId") or items[-1].get("id")
            if not cursor:
                break

    return results


async def validate_credentials(api_key: str, is_paper: bool = False) -> bool:
    base = _base(is_paper)
    headers = {**HEADERS, "Authorization": api_key}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{base}/api/v0/equity/account/info",
                headers=headers,
            )
            return r.status_code == 200
    except Exception:
        return False

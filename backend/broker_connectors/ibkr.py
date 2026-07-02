"""Interactive Brokers Flex Query connector (official read-only API).

Setup (user does this once in IB Web Portal):
  1. Reports → Flex Queries → Create Trade Confirmation Flex Query
  2. Enable: Symbol, Buy/Sell, Quantity, TradePrice, IBCommission, TradeDate, AssetCategory
  3. Format: XML
  4. Save → note the Query ID
  5. Manage Flex Queries → Create Token → note the Token

We store: encrypted token + query_id (plain, not sensitive).
"""
import asyncio
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any

import httpx

BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
HEADERS = {"User-Agent": "Mozilla/5.0"}


class IBKRError(Exception):
    pass


async def _request_statement(token: str, query_id: str) -> str:
    """Step 1: request statement generation, returns reference code."""
    async with httpx.AsyncClient(headers=HEADERS, timeout=20) as client:
        r = await client.get(
            f"{BASE}.SendRequest",
            params={"t": token, "q": query_id, "v": "3"},
        )
        r.raise_for_status()

    root = ET.fromstring(r.text)
    status = root.findtext("Status")
    if status != "Success":
        err = root.findtext("ErrorMessage") or root.findtext("ErrorCode") or "Unknown error"
        raise IBKRError(f"IB Flex request failed: {err}")

    ref = root.findtext("ReferenceCode")
    if not ref:
        raise IBKRError("No ReferenceCode in IB response")
    return ref


async def _get_statement(token: str, ref: str) -> str:
    """Step 2: poll until statement is ready (usually <5s), return XML."""
    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        for attempt in range(10):
            await asyncio.sleep(2 * (attempt + 1))
            r = await client.get(
                f"{BASE}.GetStatement",
                params={"t": token, "q": ref, "v": "3"},
            )
            r.raise_for_status()
            if "<FlexQueryResponse" in r.text:
                return r.text
            # Still generating — check for error
            try:
                root = ET.fromstring(r.text)
                err = root.findtext("ErrorMessage") or ""
                if err and "1019" not in err:   # 1019 = statement not ready yet
                    raise IBKRError(f"IB Flex error: {err}")
            except ET.ParseError:
                pass

    raise IBKRError("IB Flex statement timed out after 10 attempts")


def _parse_xml(xml_text: str) -> list[dict]:
    """Parse IB Flex XML into our internal transaction format."""
    root = ET.fromstring(xml_text)
    results = []

    for trade in root.iter("Trade"):
        asset_cat = trade.get("assetCategory", "")
        if asset_cat not in ("STK", "ETF", "FUT", "OPT"):
            continue   # skip bonds, cash, etc.

        buy_sell = trade.get("buySell", "")
        if buy_sell not in ("BUY", "SELL"):
            continue

        symbol = (trade.get("symbol") or "").upper().strip()
        qty = abs(float(trade.get("quantity") or 0))
        price = abs(float(trade.get("tradePrice") or 0))
        commission = abs(float(trade.get("ibCommission") or 0))
        trade_date = trade.get("tradeDate") or ""  # YYYYMMDD or YYYY-MM-DD
        currency = trade.get("currency") or "USD"

        if len(trade_date) == 8:  # YYYYMMDD
            trade_date = f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:]}"

        asset_type = "stock" if asset_cat in ("STK", "ETF") else "stock"

        if not symbol or qty == 0:
            continue

        results.append({
            "symbol": symbol,
            "name": trade.get("description") or symbol,
            "asset_type": asset_type,
            "type": buy_sell,
            "date": trade_date[:10],
            "quantity": qty,
            "price_usd": price,
            "price_currency": currency,
            "fee": commission,
            "fee_currency": currency,
            "notes": f"IBKR import · {trade.get('tradeID', '')}",
            "_broker_id": trade.get("tradeID") or "",
            "_broker": "ibkr",
        })

    return results


async def fetch_transactions(token: str, query_id: str) -> list[dict]:
    """Full flow: request → poll → parse."""
    ref = await _request_statement(token, query_id)
    xml_text = await _get_statement(token, ref)
    return _parse_xml(xml_text)


async def validate_credentials(token: str, query_id: str) -> bool:
    try:
        ref = await _request_statement(token, query_id)
        return bool(ref)
    except IBKRError:
        return False

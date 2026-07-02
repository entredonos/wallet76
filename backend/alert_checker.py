"""
Background task: checks active price alerts every CHECK_INTERVAL seconds
and sends email notifications when triggered.

Flow:
  1. Load all active alerts from DB.
  2. Group by asset_type to batch-fetch prices (crypto via CoinGecko, stocks via yfinance).
  3. For each alert whose condition is met:
     - Mark as triggered in DB (triggered_at, triggered_price_usd).
     - Look up the user's email and their alert_emails preference.
     - If preference is enabled (default: True), fire-and-forget email via Resend.
"""

import asyncio
from datetime import datetime, timezone

from core import db, APP_URL, logger
from prices import get_crypto_prices, get_stock_prices
from email_utils import send_email, alert_email_html

CHECK_INTERVAL = 300  # seconds (5 minutes)


async def _fetch_prices_for_alerts(alerts: list) -> dict[str, float]:
    """
    Returns a flat dict: { lookup_key: price_usd }
    For crypto: lookup_key = coingecko_id (lower) or symbol (lower)
    For stocks:  lookup_key = symbol (upper)
    """
    crypto_ids = []
    stock_syms = []

    for a in alerts:
        if a["asset_type"] == "crypto":
            cg_id = (a.get("coingecko_id") or a["symbol"]).lower()
            crypto_ids.append(cg_id)
        else:
            stock_syms.append(a["symbol"].upper())

    crypto_prices, stock_prices = await asyncio.gather(
        get_crypto_prices(list(set(crypto_ids))),
        get_stock_prices(list(set(stock_syms))),
    )

    prices: dict[str, float] = {}

    for cg_id, data in crypto_prices.items():
        price = data.get("usd") if isinstance(data, dict) else None
        if price:
            prices[cg_id.lower()] = float(price)

    for sym, data in stock_prices.items():
        price = data.get("usd") if isinstance(data, dict) else None
        if price:
            prices[sym.upper()] = float(price)

    return prices


def _is_triggered(alert: dict, price_usd: float) -> bool:
    condition = alert.get("condition")
    target = alert.get("target_price_usd")
    if target is None:
        return False
    if condition == "above":
        return price_usd >= float(target)
    if condition == "below":
        return price_usd <= float(target)
    return False


def _price_key(alert: dict) -> str:
    if alert["asset_type"] == "crypto":
        return (alert.get("coingecko_id") or alert["symbol"]).lower()
    return alert["symbol"].upper()


async def _send_alert_email(user_email: str, alert: dict, price_usd: float) -> None:
    subject, html = alert_email_html(
        name=alert.get("name") or alert["symbol"],
        symbol=alert["symbol"],
        condition=alert["condition"],
        target_price=float(alert["target_price_usd"]),
        triggered_price=price_usd,
        note=alert.get("note") or "",
        app_url=APP_URL,
    )
    await send_email(to=user_email, subject=subject, html=html)


async def check_alerts_once() -> None:
    """Single pass: load alerts, fetch prices, trigger matches."""
    try:
        alerts = await db.alerts.find(
            {"active": True, "triggered_at": None},
            {"_id": 0},
        ).to_list(5000)

        if not alerts:
            return

        prices = await _fetch_prices_for_alerts(alerts)

        triggered = []
        for alert in alerts:
            key = _price_key(alert)
            price = prices.get(key)
            if price is None:
                continue
            if _is_triggered(alert, price):
                triggered.append((alert, price))

        if not triggered:
            return

        logger.info(f"Alert checker: {len(triggered)} alert(s) triggered.")

        # Collect unique user_ids to batch-fetch user data
        user_ids = list({a["user_id"] for a, _ in triggered})
        users_cursor = db.users.find(
            {"id": {"$in": user_ids}},
            {"id": 1, "email": 1, "_id": 0},
        )
        users_by_id = {u["id"]: u async for u in users_cursor}

        # Load alert_emails preferences for these users
        prefs_cursor = db.user_prefs.find(
            {"user_id": {"$in": user_ids}},
            {"user_id": 1, "alert_emails": 1, "_id": 0},
        )
        prefs_by_user: dict[str, bool] = {}
        async for p in prefs_cursor:
            # Default True: send emails unless the user explicitly opted out
            prefs_by_user[p["user_id"]] = p.get("alert_emails", True)

        now = datetime.now(timezone.utc).isoformat()

        for alert, price in triggered:
            # Mark as triggered in DB
            await db.alerts.update_one(
                {"id": alert["id"]},
                {"$set": {
                    "active": False,
                    "triggered_at": now,
                    "triggered_price_usd": price,
                }},
            )

            user = users_by_id.get(alert["user_id"])
            if not user:
                continue

            # Respect the user's email preference (default: enabled)
            email_enabled = prefs_by_user.get(alert["user_id"], True)
            if not email_enabled:
                continue

            # Fire-and-forget — don't block the checker loop
            task = asyncio.create_task(
                _send_alert_email(user["email"], alert, price)
            )
            task.add_done_callback(_task_error_logger)

    except Exception as e:
        logger.error(f"Alert checker error: {e}", exc_info=True)


def _task_error_logger(task: asyncio.Task) -> None:
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return
    if exc:
        logger.warning(f"Alert email task failed: {exc}")


async def run_alert_checker() -> None:
    """Infinite loop — call once from FastAPI startup."""
    logger.info(f"Alert checker started (interval={CHECK_INTERVAL}s)")
    while True:
        await check_alerts_once()
        await asyncio.sleep(CHECK_INTERVAL)

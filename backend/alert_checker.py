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
from telegram_utils import send_telegram_message
from push_utils import send_web_push, send_fcm

CHECK_INTERVAL = 300  # seconds (5 minutes)

# Texto do alerta por push/Telegram nas 6 línguas (11 jul 2026 — canais
# multi-idioma, REGRA #1 do CLAUDE.md). O email já tinha o seu próprio
# template HTML (email_utils.alert_email_html); estes são versões curtas de
# texto simples para notificação push e mensagem Telegram.
_ALERT_TITLE = {
    "en": "Price alert triggered",
    "pt": "Alerta de preço disparado",
    "fr": "Alerte de prix déclenchée",
    "de": "Preisalarm ausgelöst",
    "it": "Avviso di prezzo attivato",
    "es": "Alerta de precio activada",
}


def _alert_line(lang: str, symbol: str, condition: str, price: float, target: float) -> str:
    cond_word = {
        "en": "above" if condition == "above" else "below",
        "pt": "acima de" if condition == "above" else "abaixo de",
        "fr": "au-dessus de" if condition == "above" else "en dessous de",
        "de": "über" if condition == "above" else "unter",
        "it": "sopra" if condition == "above" else "sotto",
        "es": "por encima de" if condition == "above" else "por debajo de",
    }.get(lang, "above" if condition == "above" else "below")
    return f"{symbol}: ${price:,.2f} ({cond_word} ${target:,.2f})"


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


async def _send_push_and_cleanup(subscription: dict, title: str, body: str, url: str) -> None:
    """Envia o push e, se o serviço de push confirmar que a subscription já
    não existe (404/410 — utilizador desinstalou a app, limpou dados do
    site, etc.), apaga-a da BD para não continuarmos a tentar enviar para
    ela em cada alerta futuro."""
    _success, gone = await send_web_push(subscription, title, body, url)
    if gone:
        await db.push_subscriptions.delete_one({"endpoint": subscription["endpoint"]})


async def _send_fcm_and_cleanup(token: str, title: str, body: str, url: str) -> None:
    """Envia FCM e apaga o token da BD se estiver invalido/desregistado."""
    _ok, gone = await send_fcm(token, title, body, url)
    if gone:
        await db.fcm_tokens.delete_one({"token": token})


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

        # Load channel preferences for these users (11 jul 2026: passou a
        # incluir alert_push/alert_telegram, além do já existente
        # alert_emails — mesmo default "True a menos que o utilizador tenha
        # desativado explicitamente").
        prefs_cursor = db.user_prefs.find(
            {"user_id": {"$in": user_ids}},
            {"user_id": 1, "alert_emails": 1, "alert_push": 1, "alert_telegram": 1, "language": 1, "_id": 0},
        )
        prefs_by_user: dict[str, dict] = {}
        async for p in prefs_cursor:
            prefs_by_user[p["user_id"]] = p

        # Telegram chat_id e subscriptions de push por utilizador — só
        # fazemos as duas queries extra se algum dos canais realmente tiver
        # utilizadores a usá-lo, para não pagar round-trips à BD à toa numa
        # instalação onde ninguém ligou nenhum dos dois.
        telegram_by_user: dict[str, str] = {}
        async for t in db.telegram_links.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "chat_id": 1}):
            telegram_by_user[t["user_id"]] = t["chat_id"]

        push_subs_by_user: dict[str, list] = {}
        async for s in db.push_subscriptions.find({"user_id": {"$in": user_ids}}, {"_id": 0}):
            push_subs_by_user.setdefault(s["user_id"], []).append(s)

        fcm_by_user: dict[str, list] = {}
        async for f in db.fcm_tokens.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "token": 1}):
            fcm_by_user.setdefault(f["user_id"], []).append(f["token"])

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

            prefs = prefs_by_user.get(alert["user_id"], {})
            lang = prefs.get("language") or "en"
            if lang not in _ALERT_TITLE:
                lang = "en"

            # Email (comportamento já existente, inalterado)
            if prefs.get("alert_emails", True):
                task = asyncio.create_task(_send_alert_email(user["email"], alert, price))
                task.add_done_callback(_task_error_logger)

            # Telegram
            chat_id = telegram_by_user.get(alert["user_id"])
            if chat_id and prefs.get("alert_telegram", True):
                text = f"🔔 <b>{_ALERT_TITLE[lang]}</b>\n{_alert_line(lang, alert['symbol'], alert['condition'], price, float(alert['target_price_usd']))}"
                task = asyncio.create_task(send_telegram_message(chat_id, text))
                task.add_done_callback(_task_error_logger)

            # Web Push
            if prefs.get("alert_push", True):
                for sub in push_subs_by_user.get(alert["user_id"], []):
                    subscription = {"endpoint": sub["endpoint"], "keys": sub["keys"]}
                    body = _alert_line(lang, alert["symbol"], alert["condition"], price, float(alert["target_price_usd"]))
                    task = asyncio.create_task(
                        _send_push_and_cleanup(subscription, _ALERT_TITLE[lang], body, APP_URL)
                    )
                    task.add_done_callback(_task_error_logger)

            # FCM (app nativa Android/iOS) — mesma preferencia alert_push
            if prefs.get("alert_push", True):
                for token in fcm_by_user.get(alert["user_id"], []):
                    body = _alert_line(lang, alert["symbol"], alert["condition"], price, float(alert["target_price_usd"]))
                    task = asyncio.create_task(
                        _send_fcm_and_cleanup(token, _ALERT_TITLE[lang], body, APP_URL)
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

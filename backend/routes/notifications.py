"""Alertas multi-canal (11 jul 2026) — Telegram + Web Push, a alternativa
mais rápida a WhatsApp/Messenger/Instagram (essas ficam bloqueadas pela
verificação de negócio da Meta e pela janela de 24h para mensagens fora de
template; ver conversa com o utilizador). Telegram: bot criado via
@BotFather, sem revisão. Web Push: standard do browser, sem conta de
terceiros — ver push_utils.py e telegram_utils.py para os detalhes de cada
canal.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, Header

from core import db, get_current_user, logger, VAPID_PUBLIC_KEY, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME
from models import PushSubscriptionIn
from push_utils import fcm_configured
from telegram_utils import (
    telegram_configured, new_link_code, get_telegram_bot_username, send_telegram_message,
    TELEGRAM_LINKED_MSG, TELEGRAM_INVALID_CODE_MSG,
)

router = APIRouter()

LINK_CODE_TTL_MIN = 10


@router.get("/notifications/status")
async def notifications_status(user=Depends(get_current_user)):
    link = await db.telegram_links.find_one({"user_id": user["id"]}, {"_id": 0, "chat_id": 1})
    sub_count = await db.push_subscriptions.count_documents({"user_id": user["id"]})
    fcm_count = await db.fcm_tokens.count_documents({"user_id": user["id"]})
    return {
        "telegram_linked": bool(link),
        "push_subscribed": sub_count > 0,
        "push_available": bool(VAPID_PUBLIC_KEY),
        "telegram_available": telegram_configured(),
        "fcm_registered": fcm_count > 0,
        "fcm_available": fcm_configured(),
    }


# --- Web Push ---

@router.get("/notifications/vapid-public-key")
async def vapid_public_key():
    # Não exige login — o frontend precisa disto antes de o utilizador
    # sequer aceitar a permissão de notificações, que é anterior a qualquer
    # ecrã autenticado nalguns fluxos (ex.: prompt logo após o login).
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/notifications/push/subscribe")
async def push_subscribe(payload: PushSubscriptionIn, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.push_subscriptions.update_one(
        {"endpoint": payload.endpoint},
        {"$set": {
            "user_id": user["id"],
            "endpoint": payload.endpoint,
            "keys": {"p256dh": payload.keys.p256dh, "auth": payload.keys.auth},
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/notifications/push/unsubscribe")
async def push_unsubscribe(payload: dict, user=Depends(get_current_user)):
    endpoint = payload.get("endpoint")
    if not endpoint:
        raise HTTPException(400, "endpoint required")
    await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
    return {"ok": True}


# --- FCM (app nativa Android/iOS) ---

@router.post("/notifications/fcm/register")
async def fcm_register(payload: dict, user=Depends(get_current_user)):
    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(400, "token required")
    now = datetime.now(timezone.utc).isoformat()
    await db.fcm_tokens.update_one(
        {"token": token},
        {"$set": {"user_id": user["id"], "token": token,
                  "platform": (payload.get("platform") or "android"), "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/notifications/fcm/unregister")
async def fcm_unregister(payload: dict, user=Depends(get_current_user)):
    token = (payload.get("token") or "").strip()
    if token:
        await db.fcm_tokens.delete_one({"token": token, "user_id": user["id"]})
    return {"ok": True}


# --- Telegram ---

@router.post("/notifications/telegram/link-code")
async def telegram_link_code(user=Depends(get_current_user)):
    if not telegram_configured():
        raise HTTPException(503, "Telegram not configured")
    code = new_link_code()
    now = datetime.now(timezone.utc)
    await db.telegram_link_codes.insert_one({
        "code": code,
        "user_id": user["id"],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=LINK_CODE_TTL_MIN)).isoformat(),
    })
    username = TELEGRAM_BOT_USERNAME or await get_telegram_bot_username()
    deep_link = f"https://t.me/{username}?start={code}" if username else ""
    return {"code": code, "botUsername": username, "deepLink": deep_link, "expiresInMin": LINK_CODE_TTL_MIN}


@router.post("/notifications/telegram/unlink")
async def telegram_unlink(user=Depends(get_current_user)):
    await db.telegram_links.delete_one({"user_id": user["id"]})
    return {"ok": True}


@router.post("/webhooks/telegram")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str = Header(default="")):
    # Confirma que o pedido vem mesmo do Telegram (cabeçalho definido no
    # setWebhook em server.py) — sem isto, qualquer um podia bater nesta
    # rota e fingir ser o bot.
    if x_telegram_bot_api_secret_token != TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret token")

    update = await request.json()
    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if not chat_id or not text.startswith("/start"):
        return {"ok": True}

    parts = text.split(maxsplit=1)
    code = parts[1].strip() if len(parts) > 1 else ""
    if not code:
        return {"ok": True}

    now = datetime.now(timezone.utc).isoformat()
    link_doc = await db.telegram_link_codes.find_one({"code": code})

    # Idioma do utilizador (se já soubermos) para responder na língua certa;
    # antes de saber quem é, cai em inglês.
    lang = "en"

    if not link_doc or link_doc.get("expires_at", "") < now:
        await send_telegram_message(str(chat_id), TELEGRAM_INVALID_CODE_MSG[lang])
        return {"ok": True}

    user_id = link_doc["user_id"]
    prefs = await db.user_prefs.find_one({"user_id": user_id}, {"_id": 0, "language": 1})
    lang = (prefs or {}).get("language") or "en"
    if lang not in TELEGRAM_LINKED_MSG:
        lang = "en"

    await db.telegram_links.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "chat_id": str(chat_id), "linked_at": now}},
        upsert=True,
    )
    await db.telegram_link_codes.delete_one({"code": code})
    await send_telegram_message(str(chat_id), TELEGRAM_LINKED_MSG[lang])
    return {"ok": True}

"""Telegram Bot API helpers (11 jul 2026) — canal de alertas alternativo ao
email, pedido pelo utilizador depois de recusarmos WhatsApp/Messenger/
Instagram por causa da verificação de negócio da Meta e da janela de 24h
para mensagens não-template. Telegram não tem nenhuma dessas barreiras: um
bot é criado em minutos via @BotFather (sem revisão nem conta empresarial),
e pode escrever a qualquer utilizador que lhe tenha dado /start.

Nunca levanta exceção para fora — mesmo padrão do send_email() em
email_utils.py: falhas ficam só em log, nunca derrubam o alert_checker.
"""
import asyncio
import secrets

import httpx

from core import TELEGRAM_BOT_TOKEN, logger

TELEGRAM_API = "https://api.telegram.org"


def telegram_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


async def send_telegram_message(chat_id: str, text: str) -> bool:
    """Envia uma mensagem de texto simples. Retorna True/False, nunca levanta."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not configured — skipping Telegram send")
        return False
    url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            })
        if resp.status_code != 200:
            logger.warning(f"Telegram send failed ({resp.status_code}): {resp.text[:300]}")
            return False
        return True
    except Exception as e:
        logger.error(f"Telegram send exception: {e}")
        return False


async def set_telegram_webhook(webhook_url: str, secret_token: str) -> None:
    """Chamado uma vez no arranque do servidor (server.py) — regista o
    webhook automaticamente sempre que TELEGRAM_BOT_TOKEN está definido, para
    não exigir nenhum passo manual de setup além de criar o bot e definir a
    variável de ambiente no Render."""
    if not TELEGRAM_BOT_TOKEN:
        return
    url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/setWebhook"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "url": webhook_url,
                "secret_token": secret_token,
                "allowed_updates": ["message"],
            })
        if resp.status_code == 200 and resp.json().get("ok"):
            logger.info(f"Telegram webhook registered: {webhook_url}")
        else:
            logger.warning(f"Telegram setWebhook failed: {resp.text[:300]}")
    except Exception as e:
        logger.error(f"Telegram setWebhook exception: {e}")


async def get_telegram_bot_username() -> str:
    """getMe — usado para construir o deep link t.me/<username>?start=<code>
    quando TELEGRAM_BOT_USERNAME não está definido manualmente."""
    if not TELEGRAM_BOT_TOKEN:
        return ""
    url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/getMe"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        data = resp.json()
        if data.get("ok"):
            return data["result"].get("username", "")
    except Exception as e:
        logger.error(f"Telegram getMe exception: {e}")
    return ""


def new_link_code() -> str:
    """Código curto e aleatório para o fluxo /start <code> — não precisa de
    ser criptograficamente imprevisível a longo prazo (expira em minutos),
    mas usa secrets em vez de random por hábito de segurança."""
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


# Mensagens do bot nas 6 línguas (REGRA #1 do CLAUDE.md aplica-se a texto
# visível ao utilizador — isto é texto visível ao utilizador, mesmo saindo
# pelo Telegram em vez de pela UI da app). A língua vem da preferência
# guardada em user_prefs no momento do /start.
TELEGRAM_LINKED_MSG = {
    "en": "✅ <b>Wallet76</b> connected! You'll get your price alerts here from now on.",
    "pt": "✅ <b>Wallet76</b> ligado! A partir de agora recebe aqui os seus alertas de preço.",
    "fr": "✅ <b>Wallet76</b> connecté ! Vous recevrez désormais vos alertes de prix ici.",
    "de": "✅ <b>Wallet76</b> verbunden! Ihre Preisalarme erhalten Sie ab jetzt hier.",
    "it": "✅ <b>Wallet76</b> collegato! Da ora riceverai qui i tuoi avvisi di prezzo.",
    "es": "✅ <b>Wallet76</b> conectado! A partir de ahora recibirás aquí tus alertas de precio.",
}
TELEGRAM_INVALID_CODE_MSG = {
    "en": "This link has expired or is invalid. Generate a new one in Wallet76 → Settings → Notifications.",
    "pt": "Esta ligação expirou ou é inválida. Gere uma nova em Wallet76 → Definições → Notificações.",
    "fr": "Ce lien a expiré ou est invalide. Générez-en un nouveau dans Wallet76 → Paramètres → Notifications.",
    "de": "Dieser Link ist abgelaufen oder ungültig. Erstellen Sie einen neuen in Wallet76 → Einstellungen → Benachrichtigungen.",
    "it": "Questo link è scaduto o non valido. Generane uno nuovo in Wallet76 → Impostazioni → Notifiche.",
    "es": "Este enlace ha caducado o no es válido. Genera uno nuevo en Wallet76 → Ajustes → Notificaciones.",
}

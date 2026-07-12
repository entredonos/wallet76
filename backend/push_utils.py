"""Web Push (11 jul 2026) — notificações nativas do browser/PWA/desktop via
Push API + VAPID, sem depender de nenhum serviço/conta de terceiros que o
utilizador tenha de configurar (ao contrário de Firebase Cloud Messaging).
Funciona no browser desktop, no PWA instalado e no Electron (usa o mesmo
Chromium com suporte a Push API) — não funciona dentro da WebView do APK
Android via Capacitor sem @capacitor/push-notifications + Firebase, isso
fica fora do âmbito desta ronda (assinalado no aviso de canais na UI).

Usa a biblioteca `pywebpush`, que trata da cifra ECDH/AES-GCM exigida pelo
protocolo Web Push e da assinatura VAPID (JWT ES256) — reimplementar isto à
mão seria bastante mais código para o mesmo resultado.
"""
import asyncio
import json

from pywebpush import webpush, WebPushException

from core import VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL, logger


def push_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def _send_sync(subscription: dict, payload: dict) -> tuple[bool, bool]:
    """Retorna (success, gone) — "gone" sinaliza 404/410 (subscription
    expirada/revogada), para o chamador saber que deve apagá-la da BD."""
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIM_EMAIL},
        )
        return True, False
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            logger.info(f"Push subscription gone (status {status}) — should be removed")
            return False, True
        logger.warning(f"Push send failed: {e}")
        return False, False
    except Exception as e:
        logger.error(f"Push send exception: {e}")
        return False, False


async def send_web_push(subscription: dict, title: str, body: str, url: str = "") -> tuple[bool, bool]:
    """Nunca levanta — retorna (success, gone). Corre em thread separada
    porque pywebpush é síncrono (usa `requests` internamente)."""
    if not push_configured():
        logger.warning("VAPID keys not configured — skipping push send")
        return False, False
    payload = {"title": title, "body": body, "url": url}
    return await asyncio.to_thread(_send_sync, subscription, payload)

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


# --- FCM (Firebase Cloud Messaging) — push nativo para a app Android/iOS ---
# (17 jul 2026) A WebView do APK Capacitor nao suporta Web Push; o FCM cobre
# esse caso (e o iOS via APNs por baixo). Init OPCIONAL: sem FCM_SERVICE_ACCOUNT
# no ambiente, fcm_configured() e False e send_fcm() e no-op — o backend
# continua a funcionar sem FCM (dev, ou antes de configurar). Import tambem
# opcional: se firebase-admin nao estiver instalado, ignora sem rebentar.
import os as _os

_FCM_APP = None
try:
    import firebase_admin as _fb
    from firebase_admin import credentials as _fb_credentials, messaging as _fcm
    _fcm_json = _os.environ.get("FCM_SERVICE_ACCOUNT")
    if _fcm_json:
        try:
            _FCM_APP = _fb.initialize_app(_fb_credentials.Certificate(json.loads(_fcm_json)), name="wallet76-fcm")
            logger.info("FCM configured (firebase-admin)")
        except Exception as _e:
            logger.error(f"FCM init failed: {_e}")
except ImportError:
    _fcm = None


def fcm_configured() -> bool:
    return _FCM_APP is not None


def _send_fcm_sync(token: str, title: str, body: str, url: str):
    try:
        msg = _fcm.Message(
            token=token,
            notification=_fcm.Notification(title=title, body=body),
            data={"url": url or ""},
            android=_fcm.AndroidConfig(priority="high"),
        )
        _fcm.send(msg, app=_FCM_APP)
        return True, False
    except Exception as e:
        name = type(e).__name__
        if name in ("UnregisteredError", "InvalidArgumentError", "SenderIdMismatchError"):
            logger.info(f"FCM token invalido ({name}) — remover da BD")
            return False, True
        logger.warning(f"FCM send failed: {e}")
        return False, False


async def send_fcm(token: str, title: str, body: str, url: str = ""):
    """Nunca levanta — retorna (success, gone). SDK sincrono -> thread."""
    if not fcm_configured():
        return False, False
    return await asyncio.to_thread(_send_fcm_sync, token, title, body, url)

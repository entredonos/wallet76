/**
 * Push nativo (FCM) para a app Android/iOS via Capacitor (17 jul 2026).
 * Complementa o Web Push (lib/push.js), que so funciona no browser/PWA/
 * Electron. Aqui usamos @capacitor/push-notifications: pede permissao,
 * regista no FCM, obtem o token e regista-o no backend
 * (/notifications/fcm/register). No browser e no-op (self-gate por
 * Capacitor.isNativePlatform).
 */
import { Capacitor } from "@capacitor/core";
import { api } from "./api";

let _inited = false;

export async function initNativePush() {
  if (!Capacitor.isNativePlatform()) return; // browser/PWA -> Web Push trata
  if (_inited) return;
  _inited = true;

  let PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch (e) {
    return; // plugin nao instalado
  }

  // token FCM recebido -> registar no backend
  PushNotifications.addListener("registration", async (token) => {
    try {
      await api.post("/notifications/fcm/register", {
        token: token.value,
        platform: Capacitor.getPlatform(),
      });
    } catch (e) {
      // sera tentado de novo no proximo arranque
    }
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("FCM registration error", err);
  });

  // toque na notificacao -> abrir a pagina relevante (alertas por defeito)
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action && action.notification && action.notification.data && action.notification.data.url;
    try {
      window.location.href = (url && url.indexOf("http") === 0) ? url : "/alerts";
    } catch (e) { /* noop */ }
  });

  // pedir permissao (Android 13+ e iOS exigem) e registar no FCM
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {
    console.warn("FCM permission/register failed", e);
  }
}

export async function disableNativePush() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllListeners();
    _inited = false;
  } catch (e) { /* noop */ }
}

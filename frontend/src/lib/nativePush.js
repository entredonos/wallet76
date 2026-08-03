/**
 * Push nativo (FCM) para a app Android/iOS via Capacitor (17 jul 2026).
 * Complementa o Web Push (lib/push.js), que so funciona no browser/PWA/
 * Electron. Aqui usamos @capacitor/push-notifications: pede permissao,
 * regista no FCM, obtem o token e regista-o no backend
 * (/notifications/fcm/register). No browser e no-op (self-gate por
 * Capacitor.isNativePlatform).
 *
 * 3 ago 2026 — até aqui isto corria sozinho em segundo plano (chamado uma
 * vez no login via AuthContext.jsx), mas não havia NENHUM interruptor
 * visível em Definições: a secção "Notificações push" em Settings.jsx só
 * aparecia com pushSupported() (deteção de Web Push API), que é sempre
 * falso dentro do WebView Android do Capacitor — a secção desaparecia por
 * completo na app nativa, apesar do FCM já estar a funcionar por baixo.
 * Adicionado enableNativePush()/nativePushSupported() para o toggle em
 * Settings.jsx poder mostrar e controlar isto na app nativa, e o token
 * passa a ficar guardado em localStorage para disableNativePush()
 * conseguir desregistá-lo mesmo sem um listener "registration" ativo.
 */
import { Capacitor } from "@capacitor/core";
import { api } from "./api";

const TOKEN_KEY = "w76_fcm_token";
let _inited = false;

export function nativePushSupported() {
  return Capacitor.isNativePlatform();
}

async function _registerToken(token, platform) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* noop */ }
  await api.post("/notifications/fcm/register", { token, platform });
}

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
  PushNotifications.addListener("registration", (token) => {
    _registerToken(token.value, Capacitor.getPlatform()).catch(() => {
      // sera tentado de novo no proximo arranque
    });
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

  // Regista automaticamente SÓ se a permissão já tinha sido concedida antes
  // (arranque normal da app, sessão seguinte). Não pede a permissão aqui —
  // pedir logo no login, sem o utilizador ter tocado em nada, seria um
  // prompt do sistema a aparecer do nada; o pedido explícito (1ª vez)
  // acontece em enableNativePush(), chamado pelo interruptor em Settings.jsx.
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {
    console.warn("FCM auto-register failed", e);
  }
}

/** Chamado pelo interruptor "Notificações push" em Settings.jsx quando a
 * app corre nativamente. Pede a permissão do sistema (se ainda não foi
 * decidida), regista no FCM e só resolve depois de o token chegar
 * confirmado ao backend — para o toggle poder mostrar sucesso/erro em vez
 * de assumir que correu bem. Lança um erro com `reason` legível, no mesmo
 * formato que enablePush() (lib/push.js) já usa para o Web Push, para
 * Settings.jsx poder tratar os dois com o mesmo catch. */
export async function enableNativePush() {
  if (!Capacitor.isNativePlatform()) {
    const err = new Error("unsupported"); err.reason = "unsupported"; throw err;
  }
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await initNativePush(); // garante que os listeners (registration -> _registerToken) estão ligados

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    const err = new Error("denied"); err.reason = "denied"; throw err;
  }
  await PushNotifications.register();

  // O registo em si (obter o token + o POST ao backend) acontece no
  // listener "registration" já ligado por initNativePush, de forma
  // assíncrona — sondagem curta ao localStorage em vez de um segundo
  // listener duplicado, simples e suficiente para o toggle esperar a
  // confirmação em vez de ficar otimista.
  for (let i = 0; i < 20; i++) {
    try { if (localStorage.getItem(TOKEN_KEY)) return; } catch (e) { /* noop */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const err = new Error("timeout"); err.reason = "timeout"; throw err;
}

export async function disableNativePush() {
  if (!Capacitor.isNativePlatform()) return;
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* noop */ }
  try {
    if (token) await api.post("/notifications/fcm/unregister", { token });
  } catch (e) {
    // token fica órfão no servidor (deixa de existir do lado do
    // dispositivo, mas apagar aqui falhou) — não é crítico, mesmo
    // tratamento que disablePush() já dá ao Web Push.
  }
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ }
}

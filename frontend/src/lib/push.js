/**
 * Web Push (11 jul 2026) — subscrição do browser à notificação nativa de
 * alertas de preço. Complementa o service worker existente (public/sw.js já
 * tinha os handlers "push"/"notificationclick" prontos, só faltava este
 * lado — pedir a subscrição e registá-la no backend).
 *
 * Funciona no browser desktop, no PWA instalado e no Electron (mesmo
 * Chromium). NÃO funciona dentro da WebView do APK Android via Capacitor —
 * isso exigiria @capacitor/push-notifications + Firebase Cloud Messaging,
 * fora do âmbito desta ronda (ver aviso no seletor de canais).
 */
import { api } from "./api";

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

// 12 jul 2026 — "a notificação push fica a pensar e não sai disso": o botão
// ficava preso a carregar indefinidamente porque `navigator.serviceWorker
// .ready` só resolve quando um service worker fica realmente a controlar a
// página, e nunca tinha um limite de tempo — se o registo do SW falhasse
// silenciosamente ou ainda não tivesse assumido controlo (primeiro load
// depois de um deploy, por exemplo), a promise ficava pendente para
// sempre e o `finally` que desliga o spinner nunca chegava a correr.
// withTimeout força uma rejeição ao fim de `ms`, para o botão sempre voltar
// a um estado claro (erro + mensagem) em vez de ficar preso a girar.
function withTimeout(promise, ms, reason) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => {
      const err = new Error(reason);
      err.reason = reason;
      reject(err);
    }, ms)),
  ]);
}

// applicationServerKey precisa de ser um Uint8Array, mas o backend devolve
// a chave VAPID pública em base64url (formato padrão do protocolo Web
// Push) — conversão manual, sem depender de nenhuma lib extra.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** Pede permissão (se ainda não decidida), subscreve e regista no backend.
 * Lança um erro com uma `reason` legível se algo falhar, para a UI poder
 * mostrar a mensagem certa em vez de um erro genérico. */
export async function enablePush() {
  if (!pushSupported()) {
    const err = new Error("unsupported");
    err.reason = "unsupported";
    throw err;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    const err = new Error("denied");
    err.reason = "denied";
    throw err;
  }

  const { data } = await api.get("/notifications/vapid-public-key");
  if (!data?.publicKey) {
    const err = new Error("not_configured");
    err.reason = "not_configured";
    throw err;
  }

  // 10s: dá tempo de sobra a um service worker que ainda esteja a instalar
  // (primeiro load depois de um deploy), mas não fica preso para sempre se
  // o registo tiver falhado (ver comentário do withTimeout acima).
  const registration = await withTimeout(navigator.serviceWorker.ready, 10000, "sw_timeout");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }

  await api.post("/notifications/push/subscribe", subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const registration = await withTimeout(navigator.serviceWorker.ready, 10000, "sw_timeout");
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await api.post("/notifications/push/unsubscribe", { endpoint });
  } catch {
    // subscrição local já foi removida; falha a apagar no servidor não é
    // crítica (fica órfã lá, mas deixa de receber pushes porque o endpoint
    // deixou de existir do lado do browser).
  }
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 10000, "sw_timeout");
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

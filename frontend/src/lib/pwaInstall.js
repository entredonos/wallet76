// Captures the browser's `beforeinstallprompt` event as early as possible.
// This module is imported once from index.js (module-level, not inside a
// component) precisely because Chrome/Edge fire this event only once per
// page load and never replay it — if nothing has called `.preventDefault()`
// and stashed the event by the time a component wants to show an "Instalar
// app" button, `.prompt()` is gone for that entire page load, even if the
// component that wants it mounts a few hundred ms later.
//
// Fires on Android Chrome/Edge and on Desktop Chrome/Edge (both support
// installable PWAs). Safari (iOS and macOS) never fires this event — iOS
// has no programmatic install API at all, hence the manual "Share > Add to
// Home Screen" instructions used instead wherever this is consumed.
let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

// True if already running as an installed PWA (standalone display mode on
// Android/Desktop, or `navigator.standalone` on iOS Safari) — in which case
// no install CTA should ever be shown.
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

export function isInstalled() {
  return installed || isStandalone();
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

// Subscribe to changes (prompt becoming available, or app getting
// installed) so a component can re-render when the answer changes.
export function subscribeInstallState(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Shows the native install prompt. Resolves with the browser's choice
// ({ outcome: "accepted" | "dismissed" }) or null if no prompt is available
// (already installed, unsupported browser, or the event never fired yet).
export async function triggerInstall() {
  if (!deferredPrompt) return null;
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  notify();
  return choice;
}

// Android / iOS / Desktop — drives which install CTA copy/flow to show.
export function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

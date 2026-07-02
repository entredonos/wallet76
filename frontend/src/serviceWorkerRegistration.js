/**
 * Register the Wallet76 service worker.
 * Call register() once at app startup (in index.js).
 * Only activates in production (process.env.NODE_ENV === "production")
 * OR when REACT_APP_SW_DEV=true is set.
 */

const SW_URL = `${process.env.PUBLIC_URL}/sw.js`;

export function register() {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost = Boolean(
    window.location.hostname === "localhost" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/)
  );

  // In production — always register.
  // In development — only if REACT_APP_SW_DEV=true (avoids cache confusion).
  if (process.env.NODE_ENV === "production" || process.env.REACT_APP_SW_DEV === "true") {
    window.addEventListener("load", () => {
      if (isLocalhost) {
        // On localhost, verify the SW still exists
        fetch(SW_URL)
          .then((r) => {
            if (r.status === 404 || r.headers.get("content-type")?.includes("html")) {
              // SW not found — unregister any existing one
              navigator.serviceWorker.ready.then((reg) => reg.unregister());
            } else {
              _registerSW();
            }
          })
          .catch(() => {
            console.log("No internet. App running in offline mode.");
          });
      } else {
        _registerSW();
      }
    });
  }
}

function _registerSW() {
  navigator.serviceWorker
    .register(SW_URL)
    .then((reg) => {
      reg.onupdatefound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.onstatechange = () => {
          if (installing.state === "installed") {
            if (navigator.serviceWorker.controller) {
              // New content available — show update toast if desired
              console.log("New Wallet76 version available. Refresh to update.");
              window.dispatchEvent(new CustomEvent("sw:update-available"));
            }
          }
        };
      };
    })
    .catch((err) => {
      console.error("SW registration failed:", err);
    });
}

export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.unregister())
      .catch((err) => console.error(err.message));
  }
}

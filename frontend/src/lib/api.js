import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  // 18s: generous enough for a cold Render instance to wake up and answer a
  // simple request, but still short enough that a genuinely unreachable
  // backend doesn't leave the UI hanging forever with no feedback.
  timeout: 18000,
});

// Auth relies solely on the httpOnly `access_token` cookie (sent
// automatically via withCredentials above) — we deliberately do NOT also
// keep a copy of the JWT in localStorage/Authorization headers. A token
// readable by JS defeats the point of httpOnly: any future XSS anywhere in
// the app would be able to read and exfiltrate it. The cookie-only path is
// already correctly scoped by the backend's explicit CORS origin allowlist
// (see backend/server.py), so there's no need for a header-based fallback.

// AuthProvider registers itself here on mount (see AuthContext.jsx) so the
// interceptor below can flip global auth state on a 401 without api.js
// having to import AuthContext directly (that would be a circular import —
// AuthContext already imports `api` from this file).
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 402 (subscription/limit required) is handled inline by whichever page
    // triggered the request (toast + "Upgrade" action) — see Wallets.jsx,
    // Transactions.jsx, etc. We deliberately do NOT force-navigate to
    // /pricing here: a free-tier user hitting a soft limit on one feature
    // (e.g. 2nd wallet) should stay right where they are, not get yanked
    // out of the whole app.
    //
    // 401 (session expired mid-use — access_token cookie expired while the
    // user was already inside the app) used to only show a toast per-page
    // (Dashboard.jsx etc.), leaving the Protected route's `user` truthy —
    // so the app kept rendering stale cached data under the toast instead
    // of sending the user back to /login (caught 5 jul 2026: dashboard
    // showed "Sessão expirada" but stayed on a zeroed-out Painel). Any 401
    // now also flips the global auth state, so Protected's own `if (!user)
    // return <Navigate to="/login" />` (App.js) kicks in immediately —
    // one fix here covers every page, not just Dashboard.
    if (error?.response?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

// True when the request never reached the server (backend down, no network,
// CORS block, etc.) — axios sets `error.request` but leaves `error.response`
// undefined in that case, as opposed to a normal 4xx/5xx which has a response.
export function isNetworkError(error) {
  return !!error && !error.response && !!error.request;
}

// Retries a request-issuing function when it fails with a network error
// (backend unreachable / timed out — see isNetworkError above), which is
// exactly the failure mode of a cold Render instance waking up. Real 4xx/5xx
// errors (wrong password, validation, server bug) are NOT retried — they
// reject immediately on the first attempt, same as before. `onRetry(attempt)`
// fires right before each retry so the caller can show a "reconnecting" hint
// instead of a plain error.
export async function withNetworkRetry(fn, { retries = 2, delayMs = 2500, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === retries) throw error;
      if (onRetry) onRetry(attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (detail && typeof detail.message === "string") return detail.message;
  return String(detail);
}

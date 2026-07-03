import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Auth relies solely on the httpOnly `access_token` cookie (sent
// automatically via withCredentials above) — we deliberately do NOT also
// keep a copy of the JWT in localStorage/Authorization headers. A token
// readable by JS defeats the point of httpOnly: any future XSS anywhere in
// the app would be able to read and exfiltrate it. The cookie-only path is
// already correctly scoped by the backend's explicit CORS origin allowlist
// (see backend/server.py), so there's no need for a header-based fallback.

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 402 (subscription/limit required) is handled inline by whichever page
    // triggered the request (toast + "Upgrade" action) — see Wallets.jsx,
    // Transactions.jsx, etc. We deliberately do NOT force-navigate to
    // /pricing here: a free-tier user hitting a soft limit on one feature
    // (e.g. 2nd wallet) should stay right where they are, not get yanked
    // out of the whole app.
    return Promise.reject(error);
  }
);

// True when the request never reached the server (backend down, no network,
// CORS block, etc.) — axios sets `error.request` but leaves `error.response`
// undefined in that case, as opposed to a normal 4xx/5xx which has a response.
export function isNetworkError(error) {
  return !!error && !error.response && !!error.request;
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

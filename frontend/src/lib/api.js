import axios from "axios";

// "" (not undefined) when REACT_APP_BACKEND_URL isn't set — 6 jul 2026:
// produção passou a servir a API através de um rewrite same-origin
// (frontend/vercel.json: /api/* -> Render) para o cookie httpOnly deixar
// de ser cross-site e parar de ser bloqueado pelo "Prevent Cross-Site
// Tracking" do Safari/iOS. Com isso, REACT_APP_BACKEND_URL fica vazio em
// produção e o pedido passa a ser feito a um caminho relativo ("/api").
// SEM o fallback `|| ""` aqui, `${undefined}/api` (template literal)
// resolve para a string literal "undefined/api" (JS converte undefined em
// texto dentro de template strings) — isto partia tudo silenciosamente. Em
// desenvolvimento local a env var continua definida (aponta para o
// backend local), por isso este fallback não muda nada aí.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
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
  // 10 jul 2026 — isto costumava devolver um texto fixo em inglês
  // ("Something went wrong. Please try again.") sempre que o erro não vinha
  // com "detail" (ex.: falha de rede/timeout, sem resposta do servidor).
  // Como essa string nunca é "" nem null, o padrão usado em todo o código
  // (`formatApiErrorDetail(...) || t("algo.traduzido")`) nunca chegava a
  // usar a tradução de reserva — o utilizador via sempre o texto em inglês,
  // mesmo com a app em português. Devolver null aqui deixa cada chamador
  // usar a sua própria mensagem traduzida, como já estava previsto.
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (detail && typeof detail.message === "string") return detail.message;
  return String(detail);
}

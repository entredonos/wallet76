import React, { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiErrorDetail, setUnauthorizedHandler } from "../lib/api";

const AuthContext = createContext(null);

// 9 jul 2026 — na app nativa Android (WebView), o CookieManager por vezes
// tem uma pequena folga assíncrona a persistir um cookie vindo da resposta
// de um fetch/XHR (ao contrário de uma navegação de página inteira, onde
// isso é imediato). O /auth/login já tinha respondido com sucesso e posto
// o Set-Cookie, mas o pedido seguinte (Dashboard a carregar /portfolio,
// disparado a low segundos depois) por vezes ainda não via esse cookie —
// dava 401 e mostrava "Sessão expirada" mesmo o login tendo corrido bem.
// Este "aquecimento" confirma que /auth/me já responde 200 (cookie mesmo a
// funcionar) antes de deixar o chamador navegar para o resto da app; no
// caminho normal (cookie já disponível de imediato) isto resolve-se logo na
// 1ª tentativa e não acrescenta atraso percetível.
async function waitForSessionCookie(maxAttempts = 4, delayMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await api.get("/auth/me");
      return true;
    } catch {
      if (i < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = unauth, obj = auth
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        setUser(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Any request anywhere in the app that comes back 401 (access_token
  // cookie expired mid-session) flips `user` to false here, so App.js's
  // Protected wrapper redirects to /login on its very next render — see
  // the interceptor in lib/api.js for why this lives there instead of a
  // per-page check (5 jul 2026 fix: dashboard used to just toast "sessão
  // expirada" and keep rendering stale cached data underneath).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(false);
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith("w76_dash_"))
          .forEach((k) => sessionStorage.removeItem(k));
      } catch { /* noop */ }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Push nativo (FCM) — quando o utilizador fica autenticado numa app
  // nativa (Capacitor/Android), regista o token FCM no backend. No
  // browser/PWA e no-op (esse usa Web Push, lib/push.js). Import dinamico
  // para nao pesar no bundle web nem rebentar se o plugin nao existir.
  useEffect(() => {
    if (user && typeof user === "object") {
      import("../lib/nativePush").then((m) => m.initNativePush()).catch(() => {});
    }
  }, [user]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // 2FA ativo (8 jul 2026): a resposta vem sem sessão nenhuma, só
    // {two_factor_required, pending_token} — NÃO autentica ainda. Devolve
    // isto tal como veio para o Login.jsx pedir o código a seguir; só
    // verifyTwoFactor() abaixo é que efetivamente faz setUser().
    if (data.two_factor_required) return data;
    // The backend also returns `token` in the response body, but we don't
    // persist it anywhere JS-readable (no localStorage) — the httpOnly
    // cookie it also sets is the only thing that authenticates subsequent
    // requests. See lib/api.js for why.
    await waitForSessionCookie();
    setUser(data);
    return data;
  };

  const verifyTwoFactor = async (pendingToken, code) => {
    const { data } = await api.post("/auth/2fa/verify", { pending_token: pendingToken, code });
    await waitForSessionCookie();
    setUser(data);
    return data;
  };

  const register = async (email, password, name, referralCode) => {
    // Idioma escolhido antes de registar (landing/registo). Guardado nas
    // preferencias da conta para (1) o email de verificacao ir neste idioma e
    // (2) o idioma ser aplicado em qualquer login (ver PreferencesSync).
    let language;
    try { language = localStorage.getItem("folio-lang") || undefined; } catch { language = undefined; }
    const { data } = await api.post("/auth/register", {
      email, password, name,
      referral_code: referralCode || undefined,
      language,
    });
    // Do NOT auto-login. User must verify email first.
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    // Clear dashboard cache so the next user doesn't see stale data
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("w76_dash_"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { formatApiErrorDetail };

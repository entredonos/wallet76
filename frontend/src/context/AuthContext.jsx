import React, { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiErrorDetail, setUnauthorizedHandler } from "../lib/api";

const AuthContext = createContext(null);

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
    setUser(data);
    return data;
  };

  const verifyTwoFactor = async (pendingToken, code) => {
    const { data } = await api.post("/auth/2fa/verify", { pending_token: pendingToken, code });
    setUser(data);
    return data;
  };

  const register = async (email, password, name) => {
    const { data } = await api.post("/auth/register", { email, password, name });
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

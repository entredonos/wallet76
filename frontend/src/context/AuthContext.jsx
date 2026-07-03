import React, { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";

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

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // The backend also returns `token` in the response body, but we don't
    // persist it anywhere JS-readable (no localStorage) — the httpOnly
    // cookie it also sets is the only thing that authenticates subsequent
    // requests. See lib/api.js for why.
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
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { formatApiErrorDetail };

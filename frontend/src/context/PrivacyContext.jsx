import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "folio-privacy";
const PrivacyContext = createContext({ hidden: false, toggle: () => {}, mask: (s) => s });

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0"); } catch (e) { /* noop */ }
  }, [hidden]);
  const toggle = () => setHidden((v) => !v);
  // Replace digits/$ characters with bullets but keep currency prefix style
  const mask = (formatted) => {
    if (!hidden) return formatted;
    return "•••••";
  };
  return (
    <PrivacyContext.Provider value={{ hidden, toggle, mask }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);

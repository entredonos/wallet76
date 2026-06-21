import React, { useEffect, useState } from "react";

const STORAGE_KEY = "folio-theme";
const ThemeContext = React.createContext({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    root.classList.add(theme === "light" ? "theme-light" : "theme-dark");
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeContext);

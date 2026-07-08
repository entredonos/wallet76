import React, { useEffect, useState } from "react";

const STORAGE_KEY = "folio-theme";
// Mesmo breakpoint (768px / Tailwind "md") usado em toda a app para
// distinguir mobile de desktop (Layout.jsx, Analytics.jsx, etc.).
const MOBILE_BREAKPOINT = 768;
const ThemeContext = React.createContext({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || "dark"; } catch { return "dark"; }
  });

  // Tema claro desligado no mobile (8 jul 2026) — a auditoria da revisão de
  // design encontrou várias cores fixas em `style={{ color: "#..." }}"
  // dentro dos gráficos (CandlestickBar.jsx, Analytics.jsx) que NUNCA são
  // apanhadas pelas overrides de tema claro em App.css (essas só cobrem
  // classes Tailwind, não estilos inline) — o tema claro ficaria
  // parcialmente ilegível (texto/fundo escuro de gráfico sobre página
  // clara). Em vez de corrigir cada cor inline uma a uma agora, a
  // preferência guardada (inclusive sincronizada do servidor via
  // PreferencesSync.jsx) mantém-se intacta para quando o utilizador está
  // no desktop — só a CLASSE aplicada ao <html> é forçada a escura sempre
  // que a largura da janela é de mobile, independentemente do que `theme`
  // diz. Reage também a resize (não só à mudança de `theme`), para cobrir
  // rodar um tablet ou redimensionar a janela do browser.
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const isMobileViewport = window.innerWidth < MOBILE_BREAKPOINT;
      const effective = isMobileViewport ? "dark" : theme;
      root.classList.remove("theme-light", "theme-dark");
      root.classList.add(effective === "light" ? "theme-light" : "theme-dark");
    };
    applyTheme();
    window.addEventListener("resize", applyTheme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    return () => window.removeEventListener("resize", applyTheme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeContext);

import React from "react";
import { useI18n, LANGUAGES } from "../context/I18nContext";

// Compact language switcher for pre-auth pages (Login, Register,
// ForgotPassword, ResetPassword...) where the main app Layout/sidebar
// (which has its own switcher) isn't mounted yet.
export default function AuthLangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value)}
      className="bg-zinc-900/50 border border-zinc-800 text-zinc-300 text-xs font-mono px-2 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-500"
      data-testid="auth-lang-select"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
      ))}
    </select>
  );
}

import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import { usePrivacy } from "../context/PrivacyContext";

/**
 * Pulls user preferences from the server after login and pushes local changes back.
 * Mounted once near the root (inside all providers and AuthProvider).
 */
export default function PreferencesSync() {
  const { user } = useAuth();
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const loadedRef = useRef(false);
  const lastSentRef = useRef({});

  // 1) Pull from server on login
  useEffect(() => {
    if (!user || loadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/preferences");
        if (cancelled) return;
        if (data.language && data.language !== lang) setLang(data.language);
        if (data.theme && data.theme !== theme && (setTheme || (() => {}))) setTheme?.(data.theme);
        if (typeof data.privacy_hidden === "boolean" && data.privacy_hidden !== hidden) toggle();
        loadedRef.current = true;
        lastSentRef.current = {
          language: data.language || lang,
          theme: data.theme || theme,
          privacy_hidden: !!data.privacy_hidden,
        };
      } catch {
        loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [user?.id]);

  // 2) Push local changes back (debounced via single effect per change)
  useEffect(() => {
    if (!user || !loadedRef.current) return;
    const payload = { language: lang, theme, privacy_hidden: hidden };
    const prev = lastSentRef.current || {};
    if (prev.language === payload.language && prev.theme === payload.theme && prev.privacy_hidden === payload.privacy_hidden) return;
    lastSentRef.current = payload;
    api.put("/preferences", payload).catch(() => {});
  }, [user?.id, lang, theme, hidden]);

  return null;
}

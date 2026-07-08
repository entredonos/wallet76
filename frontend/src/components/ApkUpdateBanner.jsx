import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";
import { useI18n } from "../context/I18nContext";

const DISMISS_KEY_PREFIX = "w76_apkupdate_dismissed_";

/**
 * Aviso "nova versão disponível" só para a app nativa Android/iOS (fora da
 * Play Store, por isso sem update automático da própria app — só o
 * conteúdo web dentro dela é que atualiza sozinho). Compara o versionCode
 * nativo instalado (via @capacitor/app) com public/app-version.json, servido
 * pelo mesmo domínio que a WebView já carrega (wallet76.com), sem precisar
 * de CORS. Só aparece quando há mesmo uma versão nova E o utilizador ainda
 * não dispensou esse número de versão específico.
 */
export default function ApkUpdateBanner() {
  const { t } = useI18n();
  const [info, setInfo] = useState(null); // { downloadUrl, latestVersionName }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const [{ App }, res] = await Promise.all([
          import("@capacitor/app"),
          fetch("/app-version.json", { cache: "no-store" }),
        ]);
        if (!res.ok) return;
        const remote = await res.json();
        const local = await App.getInfo();
        const localCode = parseInt(local.build, 10) || 0;
        const remoteCode = parseInt(remote.latestVersionCode, 10) || 0;
        if (remoteCode <= localCode) return;

        const dismissKey = DISMISS_KEY_PREFIX + remoteCode;
        if (localStorage.getItem(dismissKey)) return;

        setInfo({ ...remote, dismissKey });
      } catch {
        // Sem internet / endpoint em baixo / plugin não disponível ainda
        // (build antiga sem @capacitor/app) — falha em silêncio, nunca
        // bloqueia a app por causa disto.
      }
    })();
  }, []);

  if (!info) return null;

  const dismiss = () => {
    try { localStorage.setItem(info.dismissKey, "1"); } catch { /* noop */ }
    setInfo(null);
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[90] bg-blue-500 text-zinc-950 px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium"
      data-testid="apk-update-banner"
    >
      <Download className="w-4 h-4 shrink-0" />
      <span className="truncate">{t("apkupdate.desc")}</span>
      <a
        href={info.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 shrink-0"
        data-testid="apk-update-download"
      >
        {t("apkupdate.download")}
      </a>
      <button
        onClick={dismiss}
        className="ml-1 shrink-0 opacity-70 hover:opacity-100"
        aria-label={t("common.close")}
        data-testid="apk-update-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

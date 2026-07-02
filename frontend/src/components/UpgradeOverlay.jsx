import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { useI18n } from "../context/I18nContext";

/**
 * Overlay de upgrade — sobrepõe o conteúdo com blur e CTA.
 * Uso:
 *   <div className="relative">
 *     <ComponenteBloqueado />
 *     <UpgradeOverlay feature="Analytics" />
 *   </div>
 *
 * Ou como wrapper completo:
 *   <UpgradeOverlay feature="Analytics" fullPage />
 */
export default function UpgradeOverlay({ feature = "", fullPage = false }) {
  const nav = useNavigate();
  const { t } = useI18n();

  const label = t("upgrade.cta") || "Upgrade to Pro";
  const sub   = feature
    ? (t("upgrade.feature_locked") || "{f} is a Pro feature").replace("{f}", feature)
    : (t("upgrade.locked") || "This feature requires a Pro plan");
  const desc  = t("upgrade.desc") || "Unlock unlimited portfolios, Analytics, broker sync and more.";

  const cls = fullPage
    ? "fixed inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md"
    : "absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/75 backdrop-blur-sm rounded-xl";

  return (
    <div className={cls}>
      <div className="flex flex-col items-center gap-4 max-w-xs text-center px-6 py-8 bg-zinc-900/90 border border-zinc-700 rounded-2xl shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
          <Lock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">{sub}</p>
          <p className="text-xs text-zinc-400">{desc}</p>
        </div>
        <button
          onClick={() => nav("/pricing")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 text-sm font-bold transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {label}
        </button>
      </div>
    </div>
  );
}

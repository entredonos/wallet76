import React from "react";
import { Share2, X, Check, Link as LinkIcon } from "lucide-react";
import { useI18n } from "../../context/I18nContext";

// "Share Portfolio" panel — toggled from the Dashboard title row's Share
// icon. Self-contained aside from the share state itself (still owned by
// Dashboard.jsx, since it's fetched once via /share/status on mount and
// needs to survive this panel being closed/reopened).
export default function SharePanel({ shareData, shareLoading, copied, onClose, onGenerate, onRevoke, onToggleHideValues, onCopy }) {
  const { t } = useI18n();
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Share2 className="w-4 h-4 text-blue-400" /> {t("dash.share_portfolio_title")}
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {shareData ? (
        <div className="space-y-3">
          {/* Link copy row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400 truncate">
              {window.location.origin}/p/{shareData.slug}
            </div>
            <button
              onClick={onCopy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-400 text-white text-xs rounded-lg transition-colors font-medium"
            >
              {copied ? <><Check className="w-3 h-3" /> {t("dash.copied")}</> : <><LinkIcon className="w-3 h-3" /> {t("dash.copy")}</>}
            </button>
          </div>

          {/* Hide values toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-zinc-400">{t("dash.hide_public_values")}</span>
            <button
              onClick={onToggleHideValues}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${shareData.hide_values ? "bg-blue-500" : "bg-zinc-700"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${shareData.hide_values ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </label>

          {/* Revoke */}
          <button
            onClick={onRevoke}
            disabled={shareLoading}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            {t("dash.revoke_link")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 leading-relaxed">
            {t("dash.share_desc")}
          </p>
          <button
            onClick={onGenerate}
            disabled={shareLoading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
          >
            {shareLoading ? t("dash.generating") : t("dash.generate_share_link")}
          </button>
        </div>
      )}
    </div>
  );
}

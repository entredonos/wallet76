import React from "react";
import { Link } from "react-router-dom";
import { Plus, Gauge, ArrowUpRight, TrendingDown } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import Sparkline from "../Sparkline";

// Dashboard "light" view's headline card — one consolidated Saldo Total
// (value + % + mini sparkline) followed by "As tuas carteiras", instead of
// the 4 separate stacked summary cards (Saldo/Investido/Lucro-Prejuízo/
// Hoje) that "light" mode inherited from "advanced". Matches the mockup
// approved in memory/mobile_app_proposal.md (5 jul 2026 follow-up: user
// pointed at that mockup and asked for the Painel to look more like it).
// The 4-card grid still renders as before in "advanced" mode — this only
// replaces what "light" mode shows above the evolution chart.
export default function LightBalanceCard({
  totalLabel,
  changeLabel,
  positive,
  sparkline,
  onAdd,
  onAdvanced,
  wallets,
  assets,
  loading,
}) {
  const { t } = useI18n();

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">{t("dash.balance")}</div>
        {sparkline}
      </div>
      <div className="flex items-end gap-2.5 flex-wrap mb-4">
        <div className="text-3xl font-display font-light tracking-tight text-zinc-50" data-testid="light-balance-total">
          {totalLabel}
        </div>
        {changeLabel && (
          <div className={`flex items-center gap-1 text-sm font-mono font-medium mb-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
            {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {changeLabel}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-5">
        <button
          onClick={onAdd}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-800/60 transition-colors whitespace-nowrap"
          data-testid="light-balance-add"
        >
          <Plus className="w-3.5 h-3.5" /> {t("common.add")}
        </button>
        <button
          onClick={onAdvanced}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-amber-500/40 text-amber-300 text-sm font-medium hover:bg-amber-500/10 transition-colors whitespace-nowrap"
          data-testid="light-balance-advanced"
        >
          <Gauge className="w-3.5 h-3.5" /> {t("dash.view_advanced")}
        </button>
      </div>

      {/* Opção A: dentro de uma carteira específica (assets != null) mostra os
          ATIVOS dessa carteira; caso contrário, a lista das carteiras. */}
      {assets ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">{t("dash.assets")}</div>
            <Link to="/dashboard" className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors" data-testid="light-balance-back-all">
              ‹ {t("tx.all_wallets")}
            </Link>
          </div>
          {loading ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("dash.chart_loading")}</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("dash.no_assets") || t("dash.chart_empty")}</div>
          ) : (
            <div className="space-y-1.5">
              {assets.map((a) => (
                <Link
                  key={a.symbol + a.asset_type}
                  to={`/asset/${encodeURIComponent(a.symbol)}?type=${a.asset_type}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-950/40 border border-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-950/70 transition-colors"
                  data-testid={`light-balance-asset-${a.symbol}`}
                >
                  <span className="min-w-0">
                    <span className="text-sm text-zinc-200 font-medium">{a.symbol}</span>
                    <span className="text-[11px] text-zinc-500 ml-2 truncate">{a.name}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono text-zinc-300">{a.valueLabel}</span>
                    {a.changeLabel && (
                      <span className={`text-xs font-mono w-14 text-right ${a.positive ? "text-emerald-400" : "text-rose-400"}`}>
                        {a.changeLabel}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 mb-3">{t("dash.your_wallets")}</div>

          {loading ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("dash.chart_loading")}</div>
          ) : wallets.length === 0 ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("nav.no_wallets")}</div>
          ) : (
            <div className="space-y-2">
              {wallets.map((w) => (
                <Link
                  key={w.id}
                  to={`/dashboard?wallet=${w.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-950/70 transition-colors"
                  data-testid={`light-balance-wallet-${w.id}`}
                >
                  <span className="text-sm text-zinc-300 truncate">{w.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Sparkline data={w.sparkData} positive={w.positive} width={48} height={20} />
                    {w.changeLabel && (
                      <span className={`text-xs font-mono w-12 text-right ${w.positive ? "text-emerald-400" : "text-rose-400"}`}>
                        {w.changeLabel}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

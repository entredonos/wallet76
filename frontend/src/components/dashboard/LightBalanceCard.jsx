import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/I18nContext";
import Sparkline from "../Sparkline";
import { Briefcase, Coins, Wallet as WalletIcon } from "lucide-react";
import { WALLET_TEXT_CLASS, WALLET_TILE_CLASS } from "../../lib/walletColors";

const TYPE_ICON = { broker: Briefcase, exchange: Coins, wallet: WalletIcon };

// Dashboard "light" view's headline card — one consolidated Saldo Total
// (value + % + mini sparkline) followed by "As tuas carteiras", instead of
// the 4 separate stacked summary cards (Saldo/Investido/Lucro-Prejuízo/
// Hoje) that "light" mode inherited from "advanced". Matches the mockup
// approved in memory/mobile_app_proposal.md (5 jul 2026 follow-up: user
// pointed at that mockup and asked for the Painel to look more like it).
// The 4-card grid still renders as before in "advanced" mode — this only
// replaces what "light" mode shows above the evolution chart.
export default function LightBalanceCard({
  filterPills,
  wallets,
  assets,
  loading,
}) {
  const { t } = useI18n();

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      {/* Opção A: dentro de uma carteira específica (assets != null) mostra os
          ATIVOS dessa carteira; caso contrário, a lista das carteiras. */}
      {assets ? (
        <>
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            {filterPills || (
              <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">{t("dash.assets")}</div>
            )}
            <Link to="/dashboard" className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors shrink-0" data-testid="light-balance-back-all">
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
                  to={a.asset_type ? `/asset/${a.asset_type}/${encodeURIComponent(a.symbol)}` : `/asset/${encodeURIComponent(a.symbol)}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-950/40 border border-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-950/70 transition-colors"
                  data-testid={`light-balance-asset-${a.symbol}`}
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm text-zinc-200 font-medium shrink-0">{a.symbol}</span>
                    <span className="text-[11px] text-zinc-500 truncate">{a.name}</span>
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
          {filterPills ? (
            <div className="mb-3">{filterPills}</div>
          ) : (
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 mb-3">{t("dash.your_wallets")}</div>
          )}

          {loading ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("dash.chart_loading")}</div>
          ) : wallets.length === 0 ? (
            <div className="text-sm text-zinc-400 font-mono py-2">{t("nav.no_wallets")}</div>
          ) : (
            <div className="space-y-2">
              {wallets.map((w) => {
                const WIcon = TYPE_ICON[w.type] || WalletIcon;
                return (
                <Link
                  key={w.id}
                  to={`/dashboard?wallet=${w.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-950/70 transition-colors"
                  data-testid={`light-balance-wallet-${w.id}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md border ${WALLET_TILE_CLASS[w.colorKey] || "border-zinc-700 bg-zinc-800/40"}`}>
                      <WIcon className={`w-3.5 h-3.5 ${WALLET_TEXT_CLASS[w.colorKey] || "text-zinc-500"}`} />
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{w.name}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {w.valueLabel && (
                      <span className="text-sm font-mono text-zinc-200">{w.valueLabel}</span>
                    )}
                    <span className="hidden sm:inline-block"><Sparkline data={w.sparkData} positive={w.positive} width={48} height={20} /></span>
                    {w.changeLabel && (
                      <span className={`text-xs font-mono w-12 text-right ${w.positive ? "text-emerald-400" : "text-rose-400"}`}>
                        {w.changeLabel}
                      </span>
                    )}
                  </span>
                </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

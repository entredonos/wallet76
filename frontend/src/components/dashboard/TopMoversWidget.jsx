import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { fmtCurrency, fmtPct, convert } from "../../lib/format";
import AssetIcon from "../AssetIcon";
import SummaryCard from "./SummaryCard";
import TopMoverRow from "./TopMoverRow";

// Top movers (24h, this portfolio) + Best/Worst performer (all-time) —
// combined performance block. `showPerformers` mirrors the "performers"
// sub-widget toggle in Dashboard's widget config (it renders inside this
// same widget rather than as its own top-level section).
export default function TopMoversWidget({ filtered, sorted, wallets, nav, currency, fxRates, mask, showPerformers, bestPerformer, worstPerformer }) {
  const { t } = useI18n();
  if (!filtered.length) return null;

  const ranked = [...sorted].filter((a) => Number.isFinite(Number(a.change_24h)));

  const topUp = ranked
    .filter((a) => Number(a.change_24h) > 0)
    .sort((a, b) => Number(b.change_24h) - Number(a.change_24h))
    .slice(0, 3);

  const topDown = ranked
    .filter((a) => Number(a.change_24h) < 0)
    .sort((a, b) => Number(a.change_24h) - Number(b.change_24h))
    .slice(0, 3);

  const topUpDisplay = topUp.length
    ? topUp
    : filtered
        .sort((a, b) => Number(b.pnl_pct) - Number(a.pnl_pct))
        .slice(0, 3)
        .map((a) => ({ ...a, change_24h: a.pnl_pct }));

  const topUpKeys = new Set(topUpDisplay.map((a) => `${a.symbol}-${a.wallet_id}`));

  const topDownDisplay = topDown.length
    ? topDown.filter((a) => !topUpKeys.has(`${a.symbol}-${a.wallet_id}`))
    : filtered
        .filter((a) => !topUpKeys.has(`${a.symbol}-${a.wallet_id}`))
        .sort((a, b) => Number(a.pnl_pct) - Number(b.pnl_pct))
        .slice(0, 3)
        .map((a) => ({ ...a, change_24h: a.pnl_pct }));

  return (
    <>
      {/* Row 1: 24h movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpRight className="w-4 h-4 text-emerald-400"/>
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-emerald-400">{t("dash.top_movers_up")} 24h</div>
          </div>
          <div className="space-y-1.5">
            {topUpDisplay.length ? (
              topUpDisplay.map((a) => <TopMoverRow key={a.symbol + a.wallet_id} a={a} positive wallets={wallets} nav={nav} currency={currency} fxRates={fxRates} mask={mask} />)
            ) : (
              <div className="text-xs text-zinc-500 font-mono px-3 py-2">{t("dash.no_positive_movers")}</div>
            )}
          </div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownRight className="w-4 h-4 text-rose-400"/>
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-rose-400">{t("dash.top_movers_down")} 24h</div>
          </div>
          <div className="space-y-1.5">
            {topDownDisplay.length ? (
              topDownDisplay.map((a) => <TopMoverRow key={a.symbol + a.wallet_id} a={a} positive={false} wallets={wallets} nav={nav} currency={currency} fxRates={fxRates} mask={mask} />)
            ) : (
              <div className="text-xs text-zinc-500 font-mono px-3 py-2">{t("dash.no_negative_movers")}</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Best / Worst performer (all-time) */}
      {showPerformers && bestPerformer && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SummaryCard
            icon={<AssetIcon asset={bestPerformer} size={22} />}
            label={t("dash.best_performer")}
            value={bestPerformer.symbol}
            delta={`${mask(fmtCurrency(convert(bestPerformer.pnl_usd, currency, fxRates), currency))} · ${fmtPct(bestPerformer.pnl_pct)}`}
            positive={bestPerformer.pnl_pct >= 0}
            testId="card-best-performer"
            tint="emerald"
          />
          {worstPerformer && worstPerformer.symbol !== bestPerformer.symbol && (
            <SummaryCard
              icon={<AssetIcon asset={worstPerformer} size={22} />}
              label={t("dash.worst_performer")}
              value={worstPerformer.symbol}
              delta={`${mask(fmtCurrency(convert(worstPerformer.pnl_usd, currency, fxRates), currency))} · ${fmtPct(worstPerformer.pnl_pct)}`}
              positive={worstPerformer.pnl_pct >= 0}
              testId="card-worst-performer"
              tint="rose"
            />
          )}
        </div>
      )}
    </>
  );
}

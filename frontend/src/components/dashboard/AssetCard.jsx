import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingCart, Trash2, Eye, ArrowUpRight, ArrowDownRight, Tag } from "lucide-react";
import { api } from "../../lib/api";
import { fmtCurrency, fmtPct, convert, curSymbol } from "../../lib/format";
import { useI18n } from "../../context/I18nContext";
import AssetIcon from "../AssetIcon";
import FlashingPrice from "../FlashingPrice";
import { TYPE_LABELS, isNYSEOpen } from "../../constants/dashboardConstants";
import { ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY } from "../../lib/allocation";

// One holding, stacked as a card — the mobile (< md) counterpart to a row
// in AssetsTable's <table>. Shows the fields that matter most at a glance
// (price, value, P&L, 24h change) instead of cramming every desktop column
// into a ~375px-wide table, which only ever produced a horizontal-scroll
// mess on phones. Deliberately does NOT respect the desktop column-visibility
// config (colVisible) — a fixed, curated field set reads better as a card
// than an arbitrary user-toggled subset would.
export default function AssetCard({
  a, wallets, currency, fxRates, mask, hideValues,
  allocOverrides, reclassifyOpenKey, setReclassifyOpenKey, saveOverride,
  nav, load,
}) {
  const { t } = useI18n();
  const walletName = wallets.find((w) => w.id === a.wallet_id)?.name || "--";
  const pos = a.pnl_usd >= 0;
  const pos24 = (a.change_24h || 0) >= 0;
  const sym = curSymbol(currency);
  const formatPrice = (n) => `${sym}${convert(n, currency, fxRates).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rowKey = `${a.symbol}-${a.wallet_id}-${a.asset_type}`;
  const overrideCls = allocOverrides[(a.symbol || "").toUpperCase()];

  return (
    <div className="px-4 py-2.5 space-y-2" data-testid={`asset-card-${a.symbol}-${a.wallet_id}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => nav(`/asset/${a.symbol}`)}
          className="flex items-center gap-3 text-left min-w-0"
          data-testid={`asset-link-${a.symbol}`}
        >
          <AssetIcon asset={a} />
          <div className="min-w-0">
            <div className="font-mono font-medium text-zinc-100 truncate">{a.symbol}</div>
            <div className="text-xs text-zinc-400 truncate">{a.name}</div>
          </div>
        </button>
        <div className="text-right shrink-0">
          <FlashingPrice
            value={a.live_price_usd}
            formatted={formatPrice(a.live_price_usd)}
            live={a.live}
            marketOpen={a.asset_type === "crypto" ? true : isNYSEOpen()}
            testId={`price-${a.symbol}`}
          />
          {a.delayed && (
            <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{t("dash.price_delayed")}</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 font-mono text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("common.value")}</div>
          <div className="text-zinc-100">{mask(fmtCurrency(convert(a.value_usd, currency, fxRates), currency))}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 cursor-help" title={t("dash.pnl")}>{t("dash.pnl_short")}</div>
          <div className={pos ? "text-emerald-400" : "text-rose-400"}>
            {mask(fmtCurrency(convert(a.pnl_usd, currency, fxRates), currency))} <span className="text-xs">({fmtPct(a.pnl_pct)})</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("common.change_24h")}</div>
          <div className={`inline-flex items-center gap-0.5 ${pos24 ? "text-emerald-400" : "text-rose-400"}`}>
            {pos24 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {fmtPct(a.change_24h || 0)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-mono font-semibold tracking-wide px-2 py-0.5 rounded border ${
            a.asset_type === "crypto"  ? "border-amber-500/40 text-amber-400 bg-amber-500/10" :
            a.asset_type === "etf"     ? "border-blue-500/40 text-blue-400 bg-blue-500/10" :
            a.asset_type === "fund"    ? "border-purple-500/40 text-purple-400 bg-purple-500/10" :
            a.asset_type === "bond"    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" :
            a.asset_type === "cash"    ? "border-zinc-500/40 text-zinc-300 bg-zinc-500/10" :
            a.asset_type === "reit"    ? "border-orange-500/40 text-orange-400 bg-orange-500/10" :
                                         "border-zinc-700/40 text-zinc-400 bg-zinc-800/30"
          }`}>
            {TYPE_LABELS[a.asset_type] ? t(TYPE_LABELS[a.asset_type]) : a.asset_type}
          </span>
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setReclassifyOpenKey(reclassifyOpenKey === rowKey ? null : rowKey)}
              className={`p-1 rounded transition-colors ${overrideCls ? "text-amber-400 hover:text-amber-300" : "text-zinc-600 hover:text-zinc-300"}`}
              title={overrideCls ? t("alloc.reclassified_badge_tooltip") : t("alloc.reclassify_tooltip")}
              data-testid={`reclassify-btn-${a.symbol}-${a.wallet_id}`}
            >
              <Tag className="w-3 h-3" />
            </button>
            {reclassifyOpenKey === rowKey && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setReclassifyOpenKey(null)} />
                <div className="absolute left-0 top-full mt-1 z-40 w-36 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-1" data-testid={`reclassify-menu-${a.symbol}`}>
                  <button
                    type="button"
                    onClick={() => saveOverride(a.symbol, null)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-900 transition-colors ${!overrideCls ? "text-zinc-100" : "text-zinc-400"}`}
                  >
                    {t("alloc.reclassify_auto")}
                  </button>
                  <div className="my-1 border-t border-zinc-800" />
                  {ALLOCATION_CLASSES.map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => saveOverride(a.symbol, cls)}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-900 transition-colors ${overrideCls === cls ? "text-emerald-400" : "text-zinc-300"}`}
                    >
                      {t(ALLOCATION_CLASS_LABEL_KEY[cls])}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="text-[10px] font-mono text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">{walletName}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/transactions?sell=${a.symbol}&type=${a.asset_type}&wallet=${a.wallet_id}`}
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            data-testid={`action-sell-${a.symbol}`}
            title={t("common.sell")}
          >
            <ShoppingCart className="w-4 h-4" />
          </Link>
          <button
            onClick={async () => {
              if (!window.confirm(t("dash.confirm_delete_tx", { symbol: a.symbol }))) return;
              try {
                const { data: txns } = await api.get("/transactions");
                const toDelete = (txns || []).filter((tx) => tx.symbol.toUpperCase() === a.symbol.toUpperCase() && tx.wallet_id === a.wallet_id && tx.asset_type === a.asset_type);
                await Promise.all(toDelete.map((tx) => api.delete(`/transactions/${tx.id}`)));
                toast.success(t("dash.deleted_tx", { count: toDelete.length }));
                load(true);
              } catch { toast.error(t("common.error")); }
            }}
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            data-testid={`action-delete-${a.symbol}`}
            title={t("dash.delete_all_tx_tooltip")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <Link
            to={`/asset/${a.asset_type}/${a.symbol}`}
            className="p-1.5 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            data-testid={`action-chart-${a.symbol}`}
            title={t("common.chart")}
          >
            <Eye className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

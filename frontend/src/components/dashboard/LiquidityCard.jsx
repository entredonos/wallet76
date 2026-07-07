import React, { useMemo } from "react";
import { Droplets } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { fmtCurrency, convert } from "../../lib/format";

// Classes consideradas líquidas (vendáveis quase de imediato, sem prazo de
// resgate) vs. menos líquidas. REITs cobrem exposição a imobiliário sem
// precisar de um novo tipo de ativo/entrada manual — ver comentário em
// dashboardConstants.js (WIDGET_DEFS, id "liquidity").
const LIQUID_CLASSES = new Set(["stock", "etf", "crypto", "cash"]);

// "Ativos e Liquidez" (7 jul 2026) — pedido #10 da revisão de produto:
// separar o que dá para vender esta semana do que não dá, em vez de só um
// número de "património total". Calculado a partir dos holdings já
// carregados pelo Dashboard (asset_type + value_usd) — nenhum novo pedido
// à API.
export default function LiquidityCard({ holdings, currency, fxRates, hideValues }) {
  const { t } = useI18n();

  const { liquid, illiquid, total } = useMemo(() => {
    let liquid = 0, illiquid = 0;
    for (const h of holdings || []) {
      const v = Number(h.value_usd || 0);
      if (LIQUID_CLASSES.has(h.asset_type)) liquid += v;
      else illiquid += v;
    }
    return { liquid, illiquid, total: liquid + illiquid };
  }, [holdings]);

  if (total <= 0) return null;

  const fmt = (v) => (hideValues ? "•••••" : fmtCurrency(convert(v, currency, fxRates), currency));
  const liquidPct = total > 0 ? (liquid / total) * 100 : 0;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5" data-testid="liquidity-card">
      <div className="flex items-center gap-2 mb-4">
        <Droplets className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-zinc-200">{t("dash.widget_liquidity")}</span>
      </div>

      <div className="h-2 rounded-full bg-rose-500/20 overflow-hidden mb-4">
        <div className="h-full bg-blue-500/70" style={{ width: `${liquidPct}%` }} />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-400">{t("dash.liquidity_liquid")}</span>
          <span className="text-zinc-100">{fmt(liquid)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-500">{t("dash.liquidity_illiquid")}</span>
          <span className="text-zinc-400">{fmt(illiquid)}</span>
        </div>
        <div className="border-t border-zinc-800 pt-2.5 flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-200 font-medium">{t("dash.liquidity_total")}</span>
          <span className="text-zinc-100 font-medium">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

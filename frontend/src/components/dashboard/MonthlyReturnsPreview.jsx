import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, LabelList } from "recharts";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../context/I18nContext";
import { usePlan } from "../../hooks/usePlan";
import UpgradeOverlay from "../UpgradeOverlay";

function fmtMonthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Label de percentagem por barra (pedido 7 jul 2026: "quero que cada mes
// mostre as percentagens"). Custom em vez do `position` nativo do LabelList
// porque numa barra negativa o "top" do rect está na própria baseline (0) —
// ficaria colado à barra do mês ao lado. Aqui decidimos manualmente:
// positivo → por cima da barra; negativo → por baixo.
function PctLabel(props) {
  const { x, y, width, height, value } = props;
  if (value === undefined || value === null) return null;
  const positive = value >= 0;
  const cx = x + width / 2;
  const cy = positive ? y - 3 : y + height + 9;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fontSize={9}
      fontFamily="ui-monospace, monospace"
      fill={positive ? "#10b981" : "#ef4444"}
    >
      {`${positive ? "+" : ""}${value.toFixed(1)}%`}
    </text>
  );
}

// Prévia compacta do gráfico "Retornos Mensais" que já existe na página
// Análise (ReturnsBarchart em Analytics.jsx) — pedido pelo utilizador (6 jul
// 2026) para ver isto sem sair do Painel. Reutiliza o MESMO endpoint
// /analytics em vez de duplicar a lógica de cálculo de retornos mensais no
// frontend; mostra só os últimos 12 meses + melhor/pior mês, sem os
// controlos de período/benchmark/CSV da página completa — esses continuam
// exclusivos da Análise, para onde este widget tem sempre um link.
//
// Pro-only, tal como a própria página Análise (usePlan/UpgradeOverlay) — não
// faria sentido dar aqui, de borla, o que a app cobra para ver na página
// original.
export default function MonthlyReturnsPreview({ walletId }) {
  const { t } = useI18n();
  const { isPro } = usePlan();
  const [months, setMonths] = useState(null); // null = loading, [] = sem dados

  useEffect(() => {
    if (!isPro) return; // utilizador free vê só o placeholder + upgrade CTA
    let cancelled = false;
    const params = walletId && walletId !== "all" ? { wallet_id: walletId } : {};
    api.get("/analytics", { params })
      .then(({ data }) => { if (!cancelled) setMonths(data?.metrics?.months || []); })
      .catch(() => { if (!cancelled) setMonths([]); });
    return () => { cancelled = true; };
  }, [walletId, isPro]);

  const recent = useMemo(() => (months || []).slice(-12), [months]);
  const best  = recent.length ? recent.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = recent.length ? recent.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5" data-testid="monthly-returns-preview">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-sm font-medium text-zinc-200">{t("dash.widget_monthly_returns")}</div>
        <Link
          to="/analytics"
          className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
          data-testid="monthly-returns-see-full"
        >
          {t("dash.see_full_analysis")} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {!isPro ? (
        <div className="relative h-40 -mx-1">
          {/* Barras placeholder desfocadas atrás do overlay — mesma ideia
              do bloqueio usado na própria página Análise, só para dar
              textura ao card em vez de um retângulo vazio. */}
          <div className="h-full flex items-end gap-1 px-2 opacity-30 blur-[1px]">
            {[40, 65, 30, 80, 50, 20, 90, 45, 60, 35, 70, 55].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t ${i % 3 === 1 ? "bg-rose-600" : "bg-emerald-600"}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <UpgradeOverlay feature={t("dash.widget_monthly_returns")} />
        </div>
      ) : months === null ? (
        <div className="h-40 flex items-center justify-center text-zinc-600 text-sm font-mono">
          {t("dash.chart_loading")}
        </div>
      ) : recent.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-zinc-600 text-sm font-mono text-center px-4">
          {t("analytics.no_period_data")}
        </div>
      ) : (
        <>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recent} margin={{ top: 12, right: 4, left: 4, bottom: 12 }}>
                <XAxis dataKey="month" hide />
                <YAxis hide domain={[(min) => min - 4, (max) => max + 4]} />
                <Bar dataKey="pct" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {recent.map((d, i) => (
                    <Cell key={i} fill={d.pct >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                  <LabelList dataKey="pct" content={PctLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {best && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 min-w-0" data-testid="monthly-returns-best">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate">{t("dash.best_month")}</div>
                  <div className="text-sm font-mono text-emerald-400 truncate">{fmtMonthLabel(best.month)} · +{best.pct.toFixed(1)}%</div>
                </div>
              </div>
            )}
            {worst && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 min-w-0" data-testid="monthly-returns-worst">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate">{t("dash.worst_month")}</div>
                  <div className="text-sm font-mono text-rose-400 truncate">{fmtMonthLabel(worst.month)} · {worst.pct.toFixed(1)}%</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

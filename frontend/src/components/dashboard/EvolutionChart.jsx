import React from "react";
import {
  ComposedChart, Area, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { renderDayBoundaries, renderWeekendBands } from "../ChartAnnotations";
import { AreaTooltip } from "../CandlestickBar";
import { CHART_RANGES, CHART_RANGES_SHOW_DATE } from "../../constants/chartRanges";
import { fmtCurrency, curSymbol } from "../../lib/format";
import { useI18n } from "../../context/I18nContext";
import { TYPE_LABELS } from "../../constants/dashboardConstants";
import { ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR } from "../../lib/allocation";

const RANGES = CHART_RANGES;

// "Evolução da Carteira" chart — header (range selector, safety-net badge)
// + the candlestick/area chart itself. Pure presentation: every derived
// value (candleData, day boundaries, weekend bands, Y domain, safety-net
// flag) is computed in Dashboard.jsx from `history`/`filtered`, since those
// computations feed other widgets too (e.g. chartIsPositive is also used
// by the summary cards' sparkline color).
export default function EvolutionChart({
  filterType, usedSafetyNet, range, setRange, candleData, chartLoading,
  chartIsPositive, lineWeekendBands, lineDayBoundaries, candleYDomain,
  hideValues, currency, runBackfill, backfilling,
  chartClasses = [], hiddenClasses, toggleClassLine,
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-zinc-300">{t("dash.evolution")}</div>
          {filterType !== "all" && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 bg-zinc-800/60">
              {TYPE_LABELS[filterType] ? t(TYPE_LABELS[filterType]) : filterType}
            </span>
          )}
          {usedSafetyNet && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10"
              title={t("dash.safety_net_tooltip")}
              data-testid="safety-net-badge"
            >
              <ShieldAlert className="w-3 h-3"/>
              {t("dash.safety_net_badge")}
            </span>
          )}
        </div>

        <div className="flex border border-zinc-800 rounded-md overflow-hidden" data-testid="range-selector">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-mono transition-colors ${
                range === r.value
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              data-testid={`range-${r.value}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 sm:h-72" data-testid="allocation-chart">
        {candleData.length > 1 ? (
          // minWidth/minHeight: sem isto, o Recharts por vezes mede o
          // contentor com width(-1)/height(-1) mesmo antes do layout da
          // grid assentar (mais notório ao trocar de carteira/tempo,
          // que remonta este ResponsiveContainer do zero) e não desenha
          // nada — mesmo com dados corretos. Garante sempre um tamanho
          // válido para o primeiro render.
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
            <ComposedChart data={candleData} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="evoAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartIsPositive ? "#10b981" : "#ef4444"} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={chartIsPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="#27272a"
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.55}
              />

              <XAxis
                dataKey="t"
                type="category"
                stroke="#a1a1aa"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={CHART_RANGES_SHOW_DATE.has(range) ? 60 : 32}
                interval="preserveStartEnd"
                tickFormatter={(v) => {
                  try {
                    // O tick mais à direita é sempre o candle mais recente
                    // (o "agora" do gráfico) — mostrar "Hoje" em vez da
                    // data de início do seu bucket, que em ranges largos
                    // (1M/1Y) pode ficar meses/anos no passado e não
                    // significa nada para quem está a ler o gráfico.
                    const isLastTick = candleData.length > 0 && v === candleData[candleData.length - 1].t;
                    if (isLastTick && CHART_RANGES_SHOW_DATE.has(range)) {
                      return t("common.today");
                    }
                    const d = new Date(v);
                    if (CHART_RANGES_SHOW_DATE.has(range)) {
                      // Ano incluído sempre que o range pode razoavelmente
                      // cruzar anos (1W/1M/1Y/ALL, dada a regra dos 70
                      // candles) — sem isto, "18 Dez" no início e "18 Dez"
                      // um ano depois no fim ficam visualmente idênticos.
                      return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
                    }
                    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  } catch {
                    return v;
                  }
                }}
              />

              <YAxis
                yAxisId="total"
                stroke="#a1a1aa"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={58}
                domain={candleYDomain}
                tickFormatter={(v) =>
                  hideValues
                    ? "•••"
                    : `${curSymbol(currency)}${(v / 1000).toFixed(1)}K`
                }
              />

              {/* Um eixo Y escondido POR CATEGORIA (7 jul 2026) — cada linha
                  fica com o seu próprio domain "dataMin"/"dataMax" em vez de
                  partilhar a escala (em $) do total. Sem isto, uma classe
                  pequena face ao total (ex.: 500€ de crypto num portefólio
                  de 30 mil) ficava visualmente esmagada perto do fundo do
                  gráfico e parecia "reta"/sem movimento, mesmo variando de
                  verdade — bug reportado pelo utilizador (7 jul 2026,
                  "quando ativo cryptos ou ações o gráfico fica a direito"). */}
              {chartClasses.map((cls) => (
                <YAxis key={cls} yAxisId={cls} hide domain={["dataMin", "dataMax"]} />
              ))}

              <Tooltip content={<AreaTooltip formatValue={(v) => (hideValues ? "•••••" : fmtCurrency(v, currency))} positive={chartIsPositive} chartClasses={chartClasses} hiddenClasses={hiddenClasses} />} />

              {renderWeekendBands(lineWeekendBands)}
              {renderDayBoundaries(lineDayBoundaries)}

              <Area
                yAxisId="total"
                type="monotone"
                dataKey="c"
                stroke={chartIsPositive ? "#10b981" : "#ef4444"}
                strokeWidth={1.75}
                fill="url(#evoAreaFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
              />

              {/* Uma linha por categoria de ativo (7 jul 2026) — sobreposta
                  à área do total, cada uma na cor fixa de ALLOCATION_CLASS_COLOR
                  (mesma usada no pie de Distribuição e no diálogo de alvo de
                  alocação, para ler-se como a mesma cor em toda a app).
                  Escondida via legenda por baixo (chartClasses só traz
                  classes que a carteira teve nalgum ponto do período).
                  connectNulls removido: um ponto sem valor de categoria
                  (ex.: rede de segurança, sem by_class) deve mesmo aparecer
                  como falha na linha, não ser esticado/interpolado por cima
                  do tempo em que não há dado real. */}
              {chartClasses.filter((cls) => !hiddenClasses?.has(cls)).map((cls) => (
                <Line
                  key={cls}
                  yAxisId={cls}
                  type="monotone"
                  dataKey={cls}
                  stroke={ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : chartLoading ? (
          // Estado de carregamento distinto do "sem dados" — sem isto o
          // gráfico ficava indistinguível de vazio/partido enquanto o
          // fetch (que pode demorar vários segundos com retries do
          // CoinGecko) ainda estava em curso.
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600 text-sm font-mono text-center px-6">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
            <span>{t("dash.chart_loading")}</span>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600 text-sm font-mono text-center px-6">
            <span>{t("dash.chart_empty")}</span>
            {filterType !== "all" && (
              <button
                onClick={runBackfill}
                disabled={backfilling}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
              >
                {backfilling ? t("dash.chart_backfilling") : t("dash.chart_backfill_btn")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Legenda com toggle por categoria (7 jul 2026) — clicar liga/desliga
          a linha dessa classe (chartClasses/hiddenClasses vêm do Dashboard,
          persistido em localStorage). Só aparece quando há mais de uma
          categoria nos dados — com só uma classe a legenda seria redundante
          com o resto do widget. */}
      {chartClasses.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-zinc-800/50" data-testid="evolution-class-legend">
          {chartClasses.map((cls) => {
            const isHidden = hiddenClasses?.has(cls);
            const color = ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => toggleClassLine?.(cls)}
                className={`flex items-center gap-1.5 text-[11px] font-mono transition-opacity ${isHidden ? "opacity-40" : "opacity-100"}`}
                data-testid={`evolution-class-legend-${cls}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className={isHidden ? "text-zinc-500 line-through" : "text-zinc-300"}>
                  {t(ALLOCATION_CLASS_LABEL_KEY[cls] || `common.${cls}`)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

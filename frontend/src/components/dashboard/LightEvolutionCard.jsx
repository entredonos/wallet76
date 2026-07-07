import React, { useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowUpRight, TrendingDown } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR } from "../../lib/allocation";

// Dashboard "light" view's evolution card — a static, simplified read of
// the last 5 days at 4h-candle resolution (~30 points; no range picker, no
// OHLC candles, no weekend bands/safety-net badge — those stay exclusive to
// the full EvolutionChart in "advanced"). Shows a big "+X% (last 5 days)"
// badge instead of a Y-axis: the shape of the line already carries the
// trend, and a badge is faster to read at a glance than axis ticks (same
// pattern apps like Robinhood use for their home-screen chart). Hovering
// the chart swaps the badge to the change from period-start up to the
// hovered point (a hidden Tooltip drives the hit-testing; nothing is drawn
// for it — the badge itself is the "tooltip"). X-axis keeps ~1 day label
// per tick, not one per 4h point.
//
// Linhas por categoria (7 jul 2026) — pedido explícito do utilizador depois
// de perguntar se pesava no carregamento (não pesa: mesmos ~30 pontos já
// carregados, só mais uma passagem em memória — ver chartClasses/
// hiddenClasses vindos do Dashboard.jsx). Trocado de AreaChart para
// ComposedChart para poder misturar a Area do total com uma Line por
// classe, mesma combinação já usada no EvolutionChart do painel avançado.
export default function LightEvolutionCard({ title, points, changePct, loading, chartClasses = [], hiddenClasses, toggleClassLine }) {
  const { t } = useI18n();
  const [hoverIndex, setHoverIndex] = useState(null);

  // While hovering, show the change from the first point up to the
  // hovered one instead of the fixed full-period change. Falls back to the
  // full-period value the moment the cursor leaves the chart.
  const displayPct = useMemo(() => {
    if (hoverIndex === null || !points.length) return changePct;
    const first = points[0]?.v;
    const current = points[hoverIndex]?.v;
    if (!first) return changePct;
    return ((current - first) / first) * 100;
  }, [hoverIndex, points, changePct]);

  const isPositive = (displayPct ?? 0) >= 0;

  // % por categoria ao arrastar (7 jul 2026, pedido do utilizador) — mesma
  // base de comparação que o badge principal usa (início do período até ao
  // ponto sob o dedo), não o ponto anterior. Procura para trás o primeiro
  // ponto com valor real dessa classe (pode faltar nalguns, ver
  // connectNulls removido) em vez de assumir sempre points[0].
  const displayClassPcts = useMemo(() => {
    if (hoverIndex === null || !points.length) return null;
    const result = {};
    for (const cls of chartClasses) {
      if (hiddenClasses?.has(cls)) continue;
      const cur = points[hoverIndex]?.[cls];
      if (cur == null) continue;
      let first = null;
      for (let i = 0; i <= hoverIndex; i++) {
        if (points[i]?.[cls] != null) { first = points[i][cls]; break; }
      }
      if (first == null || first === 0) continue;
      result[cls] = ((cur - first) / first) * 100;
    }
    return result;
  }, [hoverIndex, points, chartClasses, hiddenClasses]);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-medium text-zinc-300">{title}</div>
        {displayPct !== null && displayPct !== undefined && (
          <div className="flex items-center gap-1.5">
            {isPositive ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
            <span className={`text-sm font-mono font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {isPositive ? "+" : ""}{displayPct.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-zinc-400">{t("dash.last_5_days")}</span>
          </div>
        )}
      </div>

      {/* % por categoria ao arrastar/hover (7 jul 2026) — só aparece com o
          dedo/rato em cima do gráfico, mesma lógica do popup do painel
          avançado, adaptada ao estilo "badge" deste cartão (sem popup
          flutuante próprio). */}
      {displayClassPcts && Object.keys(displayClassPcts).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 -mt-1" data-testid="light-evolution-hover-class-pcts">
          {Object.entries(displayClassPcts).map(([cls, pct]) => (
            <span key={cls} className="flex items-center gap-1 text-[10px] font-mono">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other }} />
              <span className="text-zinc-400">{t(ALLOCATION_CLASS_LABEL_KEY[cls] || `common.${cls}`)}</span>
              <span className={pct >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
            </span>
          ))}
        </div>
      )}

      {/* 140px -> 190px (6 jul 2026, "da para andar... mas e muito
          complicado, o da evolucao da carteira mexe muito melhor") — o
          gráfico avançado (EvolutionChart) tem h-64/h-72 (256-288px), muito
          mais alto; um alvo de toque tão baixo torna o arrastar mais
          difícil de controlar com o dedo. Mais altura = mais espaço físico
          para deslizar com precisão. */}
      <div className="h-[190px]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            {t("dash.chart_loading")}
          </div>
        ) : points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={100}>
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              onMouseMove={(state) => {
                // Recharts v3's activeTooltipIndex always comes back as a
                // STRING (e.g. "3"), even for numeric-index charts — a
                // `typeof === "number"` guard here never passes, so hover
                // silently never updated the badge. Parse it instead.
                if (state?.isTooltipActive && state.activeTooltipIndex != null) {
                  const idx = Number(state.activeTooltipIndex);
                  if (Number.isFinite(idx)) setHoverIndex(idx);
                }
              }}
              onMouseLeave={() => setHoverIndex(null)}
              // onMouseMove alone only fires for an actual mouse (or the one
              // synthetic mousemove some mobile browsers dispatch on tap) —
              // it does NOT fire while a finger drags across the chart.
              // Recharts dispatches touchmove through a SEPARATE onTouchMove
              // callback (see node_modules/recharts/lib/chart/
              // RechartsWrapper.js), but both receive the identical
              // computed state shape (isTooltipActive/activeTooltipIndex —
              // see externalEventsMiddleware.js), so the same handler works
              // for both. Without this, swiping only updated the % once, on
              // the initial touch, and stayed frozen while sliding (5 jul
              // 2026: "ele so atualiza quando do um toque... quero que
              // mesmo ao deslizar ele atualize").
              onTouchMove={(state) => {
                if (state?.isTooltipActive && state.activeTooltipIndex != null) {
                  const idx = Number(state.activeTooltipIndex);
                  if (Number.isFinite(idx)) setHoverIndex(idx);
                }
              }}
            >
              <defs>
                <linearGradient id="lightEvoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                // ~1 label per calendar day: at 6 four-hour candles/day,
                // skipping 5 between ticks shows roughly 5 labels for 5
                // days instead of one per 4h point (which would just
                // repeat "Seg Seg Seg Seg Seg Seg Ter Ter…").
                interval={Math.max(0, Math.round(points.length / 5) - 1)}
                tickFormatter={(v) => {
                  try { return new Date(v).toLocaleDateString([], { weekday: "short" }); }
                  catch { return v; }
                }}
              />
              <YAxis yAxisId="total" hide domain={["dataMin", "dataMax"]} />
              {/* Eixo Y escondido por categoria (7 jul 2026) — ver comentário
                  igual em EvolutionChart.jsx: sem um domain próprio por
                  classe, uma categoria pequena face ao total ficava
                  esmagada perto do fundo e parecia sem movimento nenhum. */}
              {chartClasses.map((cls) => (
                <YAxis key={cls} yAxisId={cls} hide domain={["dataMin", "dataMax"]} />
              ))}
              {/* No visible tooltip box — the badge above is the "tooltip".
                  This just drives hit-testing (activeTooltipIndex) and draws
                  a subtle vertical cursor line so hovering still feels
                  responsive. */}
              <Tooltip content={() => null} cursor={{ stroke: "#52525b", strokeDasharray: "3 3" }} />
              <Area
                yAxisId="total"
                type="monotone"
                dataKey="v"
                stroke={isPositive ? "#10b981" : "#ef4444"}
                strokeWidth={1.75}
                fill="url(#lightEvoFill)"
                isAnimationActive={false}
                dot={false}
                // Ponto visível exatamente debaixo do dedo ao arrastar —
                // mesma ideia do EvolutionChart (painel avançado), que já
                // tinha isto e sentia-se mais "controlável"; sem isto não
                // havia feedback visual nenhum de por onde se estava a
                // deslizar, só a linha tracejada do cursor.
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#09090b", fill: isPositive ? "#10b981" : "#ef4444" }}
              />

              {/* connectNulls removido — ver comentário em EvolutionChart.jsx,
                  mesmo raciocínio: um ponto sem categoria deve mostrar-se
                  como falha real, não uma interpolação a direito. */}
              {chartClasses.filter((cls) => !hiddenClasses?.has(cls)).map((cls) => (
                <Line
                  key={cls}
                  yAxisId={cls}
                  type="monotone"
                  dataKey={cls}
                  stroke={ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other}
                  strokeWidth={1.25}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            {t("dash.chart_empty")}
          </div>
        )}
      </div>

      {/* Legenda compacta com toggle (7 jul 2026) — mesmo padrão do painel
          avançado, mas mais apertada (gap menor, sem borda superior) para
          caber num cartão pensado para ser pequeno. */}
      {chartClasses.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" data-testid="light-evolution-class-legend">
          {chartClasses.map((cls) => {
            const isHidden = hiddenClasses?.has(cls);
            const color = ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => toggleClassLine?.(cls)}
                className={`flex items-center gap-1 text-[10px] font-mono transition-opacity ${isHidden ? "opacity-40" : "opacity-100"}`}
                data-testid={`light-evolution-class-legend-${cls}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className={isHidden ? "text-zinc-500 line-through" : "text-zinc-300"}>
                  {t(ALLOCATION_CLASS_LABEL_KEY[cls] || `common.${cls}`)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useI18n } from "../context/I18nContext";
import { ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR } from "../lib/allocation";

// Custom Recharts <Bar> shape that renders a candlestick.
//
// Usage: <Bar dataKey={(d) => [d.l, d.h]} shape={<Candle />} />
// Recharts positions the bar's pixel box so its top/bottom correspond to
// the [low, high] range from dataKey — we interpolate the open/close body
// inside that same box using the raw payload values (no need for direct
// access to the y-scale function).
export default function Candle({ x, y, width, height, payload }) {
  const { o, h, l, c } = payload || {};
  if ([o, h, l, c].some((v) => v == null || Number.isNaN(v)) || h === l) return null;
  const up = c >= o;
  const color = up ? "#10b981" : "#ef4444";
  const range = h - l || 1;
  const bodyTop = y + ((h - Math.max(o, c)) / range) * height;
  const bodyBottom = y + ((h - Math.min(o, c)) / range) * height;
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);
  const cx = x + width / 2;
  const bodyWidth = Math.max(1, width * 0.6);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

// Candlestick tooltip content — colored by the hovered candle itself
// (green/red) instead of a dark panel, so it's never black/dark-gray on
// this already-dark UI.
export function CandleTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p || [p.o, p.h, p.l, p.c].some((v) => v == null)) return null;
  const up = p.c >= p.o;
  const bg = up ? "#10b981" : "#ef4444";
  const fg = up ? "#022c1e" : "#450a0a";
  let when = label;
  try { when = new Date(label).toLocaleString(); } catch { /* keep raw label */ }
  return (
    <div style={{
      background: bg, color: fg, borderRadius: 8, padding: "8px 11px",
      fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600, lineHeight: 1.5,
    }}>
      <div style={{ opacity: 0.85, marginBottom: 3 }}>{when}</div>
      <div>O {formatValue(p.o)}&nbsp;&nbsp;H {formatValue(p.h)}&nbsp;&nbsp;L {formatValue(p.l)}&nbsp;&nbsp;C {formatValue(p.c)}</div>
    </div>
  );
}

// Tooltip for area/line charts (e.g. Dashboard's "Evolução da Carteira") —
// a dark card (matches the rest of the app's UI, unlike CandleTooltip's
// flat colored box) with the bucket's value front and center, plus a small
// up/down badge. The change badge prefers comparing against the PREVIOUS
// candle's close (`prevC`, attached by Dashboard.jsx's candleData) rather
// than this bucket's own open→close: a single-point bucket (common on
// coarse ranges like 1M/1Y, where each candle may summarize just one real
// snapshot) always has open === close, which used to leave the badge
// missing on exactly those ticks. Falls back to this candle's own open,
// then to the chart's overall trend, for the one candle with no predecessor.
// chartClasses/hiddenClasses (7 jul 2026) — pedido do utilizador: ao
// arrastar/hover no gráfico, o popup também mostra a % de cada categoria
// atualmente visível (linhas ligadas na legenda), não só a % do total. Usa
// "{cls}_prev" (anexado em Dashboard.jsx junto de prevC) como referência —
// o último valor CONHECIDO dessa classe, não necessariamente o ponto
// imediatamente anterior (uma categoria pode faltar nalguns pontos).
export function AreaTooltip({ active, payload, label, formatValue, positive, dateLabel = "", chartClasses = [], hiddenClasses }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p || p.c == null) return null;

  const visibleClasses = chartClasses.filter((cls) => !hiddenClasses?.has(cls) && p[cls] != null);

  const ref = p.prevC != null ? p.prevC : p.o;
  const hasChange = ref != null && ref !== 0 && p.c !== ref;
  const change = hasChange ? p.c - ref : null;
  const changePct = hasChange ? (change / ref) * 100 : null;
  const up = hasChange ? change >= 0 : !!positive;
  const accent = up ? "#10b981" : "#ef4444";

  let when = label;
  try { when = new Date(label).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch { /* keep raw label */ }

  return (
    <div style={{
      background: "#18181b",
      border: `1px solid ${accent}4d`,
      borderRadius: 10,
      padding: "10px 14px",
      minWidth: 148,
      boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
      fontFamily: "JetBrains Mono",
    }}>
      {dateLabel && (
        <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
          {dateLabel}
        </div>
      )}
      <div style={{ fontSize: 9, color: "#a1a1aa", marginBottom: 2 }}>{when}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#fafafa", lineHeight: 1.3 }}>{formatValue(p.c)}</div>
      {hasChange && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5,
          fontSize: 11, fontWeight: 600, color: accent,
        }}>
          <span>{up ? "▲" : "▼"}</span>
          <span>{formatValue(Math.abs(change))}</span>
          <span style={{ opacity: 0.75 }}>({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
        </div>
      )}

      {visibleClasses.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #27272a", display: "flex", flexDirection: "column", gap: 3 }}>
          {visibleClasses.map((cls) => {
            const val = p[cls];
            const prev = p[`${cls}_prev`];
            const clsHasChange = prev != null && prev !== 0 && val !== prev;
            const clsChangePct = clsHasChange ? ((val - prev) / prev) * 100 : null;
            const clsColor = ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other;
            return (
              <div key={cls} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 10 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#a1a1aa" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: clsColor, display: "inline-block" }} />
                  {t(ALLOCATION_CLASS_LABEL_KEY[cls] || `common.${cls}`)}
                </span>
                <span style={{ color: "#d4d4d8" }}>
                  {formatValue(val)}
                  {clsHasChange && (
                    <span style={{ color: clsChangePct >= 0 ? "#10b981" : "#ef4444", marginLeft: 5 }}>
                      ({clsChangePct >= 0 ? "+" : ""}{clsChangePct.toFixed(2)}%)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

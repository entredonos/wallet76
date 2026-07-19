// Dashboard.jsx was one large 2300+ line file mixing state/data-fetching
// with a lot of presentational JSX and a handful of standalone constants —
// this file holds the pure, stateless pieces (labels, column/widget defs,
// color maps, the NYSE-open check, the pie slice label renderer) so they
// can be shared by Dashboard.jsx and the extracted dashboard/* components
// without duplicating them or creating import cycles back into Dashboard.jsx.

// Returns true if NYSE is currently open (Mon–Fri 09:30–16:00 US/Eastern)
export function isNYSEOpen() {
  const now = new Date();
  // Convert to US Eastern time (ET = UTC-5 standard, UTC-4 daylight)
  // Use Intl to get correct offset at any time of year
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export const TYPE_LABELS = {
  crypto: "common.crypto",
  stock:  "common.stocks",
  etf:    "common.etfs",
  fund:   "common.funds",
  bond:   "common.bonds",
  cash:   "common.cash",
  reit:   "common.reit",
};

// Config for the type filter pills — shared between the always-visible
// "Global" row and each wallet's own inline pills (see FilterPillsRow).
// `icon` is a literal prefix, not a lucide component, to match the existing
// "₿ Crypto" style.
export const TYPE_PILL_DEFS = [
  { key: "crypto", color: "amber", icon: "₿ ", labelKey: "common.crypto" },
  { key: "stock",  color: "blue",  icon: "",   labelKey: "common.stocks" },
  { key: "etf",    color: "blue",  icon: "",   labelKey: "common.etfs" },
  { key: "fund",   color: "blue",  icon: "",   labelKey: "common.funds" },
  { key: "cash",   color: "blue",  icon: "",   labelKey: "common.cash" },
  { key: "reit",   color: "blue",  icon: "",   labelKey: "common.reit" },
];

export const PIE_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#eab308", "#ef4444", "#06b6d4", "#f97316", "#8b5cf6"];

// "UPGRADE v1.0" — percentage labels drawn directly on the pie/donut slices
// (task #89), instead of only in the legend below. Skips slivers too thin
// to fit a legible label so the chart doesn't turn into overlapping text.
export function renderPieSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fafafa"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
      fontFamily="JetBrains Mono"
      pointerEvents="none"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

export const SORT_OPTIONS = [
  { key: "value_usd", label: "Value", default: "desc" },
  { key: "symbol", label: "Asset", default: "asc" },
  { key: "price_usd", label: "Price", default: "desc" },
  { key: "quantity", label: "Holdings", default: "desc" },
  { key: "avg_cost_usd", label: "Avg cost", default: "desc" },
  { key: "pnl_usd", label: "P&L $", default: "desc" },
  { key: "pnl_pct", label: "P&L %", default: "desc" },
  { key: "change_24h", label: "24h %", default: "desc" },
  { key: "allocation", label: "% portfolio", default: "desc" },
];

// Columns user can toggle on the assets table
export const ALL_COLUMNS = [
  { key: "type",     labelKey: "dash.col_type",     always: false },
  { key: "price",    labelKey: "common.price",      always: false },
  { key: "qty",      labelKey: "common.quantity",   always: false },
  { key: "value",    labelKey: "common.value",      always: false },
  { key: "avg_cost", labelKey: "common.avg_cost",   always: false },
  { key: "pnl",      labelKey: "dash.pnl",          always: false },
  { key: "alloc",    labelKey: "common.allocation", always: false },
  { key: "change",   labelKey: "common.change_24h", always: false },
  { key: "spark",    labelKey: "common.chart_24h",  always: false },
  { key: "wallet",   labelKey: "common.wallet",     always: false },
];
export const DEFAULT_VISIBLE_COLS = ["type","price","qty","value","avg_cost","pnl","alloc","change","spark","wallet"];

// ── Widget system ────────────────────────────────────────────────────────────
export const WIDGET_DEFS = [
  // Ordem por omissão (19 jul 2026) — pirâmide invertida: números -> tendência
  // + composição (a dupla central) -> o que mexeu -> secundários -> detalhe.
  { id: "summary",    labelKey: "dash.widget_summary" },
  { id: "evolution",  labelKey: "dash.widget_evolution" },
  { id: "allocation", labelKey: "dash.widget_allocation" },
  { id: "top_movers", labelKey: "dash.widget_top_movers" },
  { id: "performers", labelKey: "dash.widget_performers" }, // sub-linha dentro de top_movers
  { id: "liquidity",  labelKey: "dash.widget_liquidity" },
  { id: "assets",     labelKey: "dash.widget_assets" },
  // "monthly_returns" removido do painel (19 jul 2026) — era uma prévia
  // duplicada do gráfico que já vive na página Análise; fica só lá.
]
export const DEFAULT_WIDGETS = WIDGET_DEFS.map((d) => ({ id: d.id, enabled: true }));

export const TINT_CLASSES = {
  blue:    { icon: "bg-blue-500/10 text-blue-400",    border: "border-blue-500/20"    },
  amber:   { icon: "bg-amber-500/10 text-amber-400",  border: "border-amber-500/20"  },
  emerald: { icon: "bg-emerald-500/10 text-emerald-400", border: "border-emerald-500/20" },
  rose:    { icon: "bg-rose-500/10 text-rose-400",    border: "border-rose-500/20"    },
  zinc:    { icon: "bg-zinc-700/40 text-zinc-400",    border: "border-zinc-700/40"    },
};

import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { fmtPct, convert, curSymbol } from "../lib/format";
import {
  AreaChart, Area, Line, ComposedChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from "recharts";
import {
  TrendingUp, TrendingDown, Activity, Award, AlertTriangle,
  BarChart2, Info, Wallet as WalletIcon, Download, Banknote, CalendarClock, Crown, SlidersHorizontal,
} from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import UpgradeOverlay from "../components/UpgradeOverlay";
import AnalyticsWidgetDrawer from "../components/AnalyticsWidgetDrawer";
import { ALLOCATION_CLASS_LABEL_KEY } from "../lib/allocation";

// Benchmarks à escolha (7 jul 2026) — antes fixo em SPY, o que não fazia
// sentido para quem investe fora dos EUA. Espelha BENCHMARK_CHOICES em
// backend/routes/analytics.py; os labelKey usam chaves próprias (não há
// necessidade de reaproveitar nenhuma já existente).
const BENCHMARK_OPTIONS = [
  { value: "SPY",       labelKey: "analytics.benchmark_spy" },
  { value: "VWCE.DE",   labelKey: "analytics.benchmark_world" },
  { value: "^STOXX50E", labelKey: "analytics.benchmark_europe" },
  { value: "QQQ",       labelKey: "analytics.benchmark_nasdaq" },
];

const RANGES = [
  { label: "1M",  days: 30  },
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1Y",  days: 365 },
  { label: "ALL", days: 0   },
];

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ANALYTICS_WIDGET_DEFS = [
  { id: "metrics",   labelKey: "analytics.widget_metrics"   },
  { id: "pnl",       labelKey: "analytics.widget_pnl"       },
  { id: "chart",     labelKey: "analytics.widget_chart"     },
  { id: "returns",   labelKey: "analytics.widget_returns"   },
  { id: "heatmap",   labelKey: "analytics.widget_heatmap"   },
  { id: "histogram", labelKey: "analytics.widget_histogram" },
  { id: "class_returns", labelKey: "analytics.widget_class_returns" },
  { id: "fees",          labelKey: "analytics.widget_fees" },
  { id: "dividends",     labelKey: "analytics.widget_dividends" },
  { id: "tax_report",    labelKey: "analytics.widget_tax_report" },
];
const DEFAULT_ANALYTICS_WIDGETS = ANALYTICS_WIDGET_DEFS.map((d) => ({ id: d.id, enabled: true }));
// Widgets mais "densos"/situacionais (8 jul 2026, revisão de menu/design
// antes do TLM) — heatmap e histograma precisam de largura para se lerem
// bem (grelha mês×ano, várias barras lado a lado) e são dos que menos se
// olham "de relance"; dividendos e relatório fiscal só interessam a quem
// tem dividendos ou está a fechar o ano. Só afeta a PRIMEIRA visita (sem
// nada ainda guardado) num ecrã estreito — continuam a existir e ligáveis
// a qualquer momento na gaveta de widgets, só não vêm ligados por defeito.
const MOBILE_DEFAULT_OFF_WIDGETS = new Set(["heatmap", "histogram", "dividends", "tax_report"]);

const HIST_BANDS = [
  { label: "<-10%",   min: -Infinity, max: -10,      pos: false },
  { label: "-10/-5%", min: -10,       max: -5,       pos: false },
  { label: "-5/-2%",  min: -5,        max: -2,       pos: false },
  { label: "-2/0%",   min: -2,        max: 0,        pos: false },
  { label: "0/+2%",   min: 0,         max: 2,        pos: true  },
  { label: "+2/+5%",  min: 2,         max: 5,        pos: true  },
  { label: "+5/+10%", min: 5,         max: 10,       pos: true  },
  { label: ">+10%",   min: 10,        max: Infinity, pos: true  },
];

function Tip({ text, children }) {
  const [pos, setPos] = useState(null);
  const ref = React.useRef(null);

  const show = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setPos(null);

  return (
    <span ref={ref} className="inline-flex items-center cursor-help" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos && (
        <span
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y - 8,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
            background: "#18181b",
            color: "#d4d4d8",
            border: "1px solid #3f3f46",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "11px",
            fontFamily: "monospace",
            lineHeight: "1.6",
            width: "220px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            pointerEvents: "none",
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function MetricCard({ label, value, sub, positive, icon: Icon, tint = "zinc", tooltip }) {
  const tints = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    rose:    "text-rose-400 bg-rose-500/10 border-rose-500/30",
    blue:    "text-blue-400 bg-blue-500/10 border-blue-500/30",
    amber:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
    zinc:    "text-zinc-300 bg-zinc-800/40 border-zinc-700",
    gray:    "text-zinc-400 bg-zinc-800/20 border-zinc-800",
  };
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{label}</div>
          {tooltip && (
            <Tip text={tooltip}>
              <Info className="w-3 h-3 text-zinc-600 cursor-help" />
            </Tip>
          )}
        </div>
        {Icon && (
          <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${tints[tint]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <div className={`mt-3 font-mono text-2xl font-light tracking-tight ${
        positive === true ? "text-emerald-400" : positive === false ? "text-rose-400" : positive === null ? "text-zinc-400" : "text-zinc-100"
      }`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs font-mono text-zinc-400">{sub}</div>}
    </div>
  );
}

const fmtDate      = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "";
const fmtDateShort = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : "";

export default function Analytics({ currency }) {
  const { t } = useI18n();
  const { isPro } = usePlan();
  const [searchParams] = useSearchParams();
  // ?wallet=ID (8 jul 2026) — mesma ideia usada em Transactions.jsx: um
  // atalho contextual "Análise desta carteira" a partir do Dashboard (com
  // uma carteira específica selecionada) já chega aqui filtrado, em vez de
  // aterrar sempre em "Todas as carteiras".
  const walletParam = searchParams.get("wallet");
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [apiError, setApiError]       = useState(null);
  const [range, setRange]             = useState("ALL");
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [wallets, setWallets]         = useState([]);
  const [walletId, setWalletId]       = useState(walletParam || "all");
  const [benchmark, setBenchmark]     = useState(() => {
    try { return localStorage.getItem("w76-analytics-benchmark") || "SPY"; } catch { return "SPY"; }
  });

  // Analytics widget config — persisted in localStorage
  const [widgetConfig, setWidgetConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("w76-analytics-widgets");
      if (raw) {
        const saved = JSON.parse(raw);
        const ids = new Set(saved.map((w) => w.id));
        return [...saved, ...ANALYTICS_WIDGET_DEFS.filter((d) => !ids.has(d.id)).map((d) => ({ id: d.id, enabled: true }))];
      }
    } catch { /* noop */ }
    // Sem nada guardado (primeira visita): no telemóvel (< md, 768px —
    // mesmo breakpoint usado em todo o resto da app), os widgets em
    // MOBILE_DEFAULT_OFF_WIDGETS começam desligados; no desktop, tudo
    // ligado como sempre foi.
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    if (!isMobileViewport) return DEFAULT_ANALYTICS_WIDGETS.map((w) => ({ ...w }));
    return ANALYTICS_WIDGET_DEFS.map((d) => ({ id: d.id, enabled: !MOBILE_DEFAULT_OFF_WIDGETS.has(d.id) }));
  });
  const [widgetDrawer, setWidgetDrawer] = useState(false);
  const wVisible = (id) => widgetConfig.find((w) => w.id === id)?.enabled !== false;

  // Persist widget config
  React.useEffect(() => {
    try { localStorage.setItem("w76-analytics-widgets", JSON.stringify(widgetConfig)); } catch { /* noop */ }
  }, [widgetConfig]);

  useEffect(() => {
    api.get("/wallets").then(r => setWallets(r.data || [])).catch(() => {});
  }, []);

  // reloadTick (10 jul 2026) — só serve para o botão "Tentar novamente"
  // forçar este efeito a correr outra vez sem duplicar toda a lógica de
  // fetch numa função à parte.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setData(null);
      setApiError(null);
      const params = { benchmark };
      if (walletId && walletId !== "all") params.wallet_id = walletId;

      // Retry automático (10 jul 2026) — "por vezes" a página dava logo
      // "Request failed with status code 502" (o texto cru do axios,
      // mostrado tal e qual ao utilizador). Na maioria dos casos é o Render
      // a arrancar a frio ou um 502/503/504 transitório, não um erro real de
      // dados — 2 tentativas extra com um pequeno atraso resolve sozinho
      // sem o utilizador ter de fazer nada.
      const isTransient = (e) => {
        const status = e?.response?.status;
        return !e?.response || status === 502 || status === 503 || status === 504;
      };
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data: d } = await api.get("/analytics", { params });
          if (!cancelled) setData(d);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (cancelled || attempt === 2 || !isTransient(e)) break;
          await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        }
      }
      if (lastErr && !cancelled) {
        console.error("[Analytics] fetch error:", lastErr);
        setApiError(
          isTransient(lastErr)
            ? (t("analytics.load_error_transient") || "The server took too long to respond. This is usually temporary.")
            : (lastErr?.response?.data?.detail || lastErr?.message || "Unknown error")
        );
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [walletId, benchmark, reloadTick]);

  const handleBenchmarkChange = (val) => {
    setBenchmark(val);
    try { localStorage.setItem("w76-analytics-benchmark", val); } catch { /* noop */ }
  };

  const filtered = useMemo(() => {
    if (!data?.series?.length) return [];
    const rangeObj = RANGES.find((r) => r.label === range);
    if (!rangeObj || rangeObj.days === 0) return data.series;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeObj.days);
    return data.series.filter((s) => s.ts >= cutoff.toISOString().slice(0, 10));
  }, [data, range]);

  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    const firstVal = filtered[0].value;
    const firstBm  = filtered.find((s) => s.benchmark != null)?.benchmark ?? 1;
    return filtered.map((s) => ({
      ts:        s.ts,
      value:     s.value,
      cost:      s.cost,
      benchmark: s.benchmark != null ? (s.benchmark / firstBm) * firstVal : null,
    }));
  }, [filtered]);

  const sym    = curSymbol(currency);
  const fmtVal = (n) => `${sym}${convert(n, currency, {}).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-xs font-mono shadow-xl">
        <div className="text-zinc-400 mb-2">{fmtDate(label)}</div>
        {payload.map((p) =>
          p.value != null && (
            <div key={p.dataKey} className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-zinc-400">{p.name}:</span>
              <span className="text-zinc-100">{fmtVal(p.value)}</span>
            </div>
          )
        )}
      </div>
    );
  };

  const m  = data?.metrics          || {};
  const bm = data?.benchmark_metrics || {};
  const benchmarkLabel = t(BENCHMARK_OPTIONS.find((o) => o.value === (data?.benchmark_symbol || benchmark))?.labelKey) || "S&P 500";

  const cagrVal  = m.cagr_pct;
  const cagrDisp = cagrVal != null ? fmtPct(cagrVal) : "N/D";
  const nMonths  = Math.round((m.history_days || 0) / 30);
  const cagrSub  = cagrVal != null
    ? (t("analytics.cagr_ok") || "{n} months of history").replace("{n}", nMonths)
    : (t("analytics.cagr_nd") || "Requires >= 1 year ({n} months)").replace("{n}", nMonths);

  const totalReturn = m.total_return_pct ?? 0;
  const latestVal   = data?.series?.length ? data.series[data.series.length - 1].value : 0;
  const latestCost  = data?.series?.length ? data.series[data.series.length - 1].cost  : 0;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("analytics.kicker") || "Performance"}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("analytics.title") || "Analytics"}</h1>
        <p className="text-zinc-400 mt-2">{t("analytics.subtitle") || "Portfolio performance vs cost basis and S&P 500."}</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setWidgetDrawer(true)}
          className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t("analytics.widgets_btn") || "Personalizar"}
        </button>
        <WalletIcon className="w-4 h-4 text-zinc-400" />
        <select
          value={walletId}
          onChange={(e) => setWalletId(e.target.value)}
          className="bg-zinc-900/70 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-500 cursor-pointer"
        >
          <option value="all">{t("common.all_portfolios") || "All Portfolios"}</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
    </div>
  );

  if (loading) return (
    <div className="space-y-8 fade-in">
      {header}
      <div className="flex items-center gap-3 text-zinc-400 font-mono text-sm">
        <Activity className="w-4 h-4 animate-pulse text-blue-400" />
        {t("analytics.loading") || "Calculating performance history..."}
      </div>
    </div>
  );

  if (apiError) return (
    <div className="space-y-8 fade-in">
      {header}
      <div className="bg-rose-950/30 border border-rose-700/40 rounded-xl p-12 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <div className="text-rose-400 font-mono text-sm">{apiError}</div>
        <button
          onClick={() => setReloadTick((n) => n + 1)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-rose-700/50 text-rose-300 hover:text-rose-100 hover:border-rose-500 transition-colors"
        >
          {t("analytics.load_error_retry") || "Try again"}
        </button>
      </div>
    </div>
  );

  if (!data?.series?.length) return (
    <div className="space-y-8 fade-in">
      {header}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-12 text-center">
        <BarChart2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <div className="text-zinc-400">{t("analytics.no_data") || "Add transactions to see analytics."}</div>
      </div>
    </div>
  );

  return (
    <div className="relative space-y-8 fade-in">
      {!isPro && <UpgradeOverlay feature="Analytics" />}
      {header}

      {/* Histórico insuficiente: numa carteira nova (ex.: acabada de importar de
          uma exchange, com posições datadas de hoje) não há tempo decorrido, por
          isso retorno/CAGR/drawdown ficam ~0. Avisamos em vez de deixar parecer
          um bug. Preenche-se sozinho com os snapshots diários. */}
      {(m.history_days ?? 0) < 2 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          {t("analytics.insufficient_history") || "Histórico insuficiente ainda — esta carteira é recente, por isso os retornos aparecem perto de 0%. A análise vai preenchendo à medida que passam os dias."}
        </div>
      )}

      {wVisible("metrics") && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label={t("analytics.total_return") || "Total Return"}
          value={fmtPct(totalReturn)}
          sub={(t("analytics.gain") || "{v} gain").replace("{v}", fmtVal(latestVal - latestCost))}
          positive={totalReturn >= 0}
          icon={totalReturn >= 0 ? TrendingUp : TrendingDown}
          tint={totalReturn >= 0 ? "emerald" : "rose"}
          tooltip={t("analytics.total_return_tooltip") || "Total % gain/loss on your portfolio since inception, compared to amount invested."}
        />
        <MetricCard
          label="CAGR"
          value={cagrDisp}
          sub={cagrSub}
          positive={cagrVal != null ? cagrVal >= 0 : null}
          icon={Activity}
          tint={cagrVal == null ? "gray" : cagrVal >= 0 ? "emerald" : "rose"}
          tooltip={t("analytics.cagr_tooltip") || "Compound Annual Growth Rate."}
        />
        <MetricCard
          label={t("analytics.max_drawdown") || "Max Drawdown"}
          value={`-${(m.max_drawdown_pct ?? 0).toFixed(1)}%`}
          sub={t("analytics.drawdown_sub") || "Peak-to-trough drop"}
          positive={false}
          icon={AlertTriangle}
          tint="amber"
          tooltip={t("analytics.drawdown_tooltip") || "Largest % drop from peak to trough."}
        />
        <MetricCard
          label={`${t("analytics.vs_benchmark_prefix") || "vs"} ${benchmarkLabel}`}
          value={fmtPct((m.total_return_pct ?? 0) - (bm.total_return_pct ?? 0))}
          sub={`${benchmarkLabel}: ${fmtPct(bm.total_return_pct ?? 0)}`}
          positive={(m.total_return_pct ?? 0) >= (bm.total_return_pct ?? 0)}
          icon={Award}
          tint={(m.total_return_pct ?? 0) >= (bm.total_return_pct ?? 0) ? "emerald" : "rose"}
          tooltip={t("analytics.vs_benchmark_tooltip_generic") || "Your return vs the chosen benchmark over the same period."}
        />
      </div>
      )}

      {wVisible("pnl") && (
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label={t("analytics.unrealized") || "Unrealized P&L"}
          value={fmtVal(data.unrealized_pnl_usd)}
          sub={t("analytics.open_positions") || "Open positions"}
          positive={data.unrealized_pnl_usd >= 0}
          tint={data.unrealized_pnl_usd >= 0 ? "emerald" : "rose"}
          tooltip={t("analytics.unrealized_tooltip") || "Current gain/loss on open positions."}
        />
        <MetricCard
          label={t("analytics.realized") || "Realized P&L"}
          value={fmtVal(data.realized_pnl_usd)}
          sub={t("analytics.closed_positions") || "Closed positions"}
          positive={data.realized_pnl_usd >= 0}
          tint={data.realized_pnl_usd >= 0 ? "emerald" : "rose"}
          tooltip={t("analytics.realized_tooltip") || "Total gain/loss from closed positions."}
        />
      </div>
      )}

      {wVisible("chart") && (
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-zinc-200">{t("analytics.chart_title") || "Portfolio vs Cost Basis"}</span>
            <Tip text={t("analytics.chart_tooltip_generic") || "Blue = current portfolio value. Grey = total amount invested. Amber dashed = the chosen benchmark, scaled to your starting investment."}>
              <Info className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
            </Tip>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowBenchmark((v) => !v)}
              className={`text-xs font-mono px-2.5 py-1 rounded-md border transition-colors ${
                showBenchmark ? "bg-blue-500/20 border-blue-500/40 text-blue-300" : "bg-zinc-900 border-zinc-700 text-zinc-400"
              }`}
            >
              {benchmarkLabel}
            </button>
            {/* Escolha de benchmark (7 jul 2026) — antes fixo em SPY; ver
                BENCHMARK_OPTIONS acima e BENCHMARK_CHOICES no backend. */}
            <select
              value={benchmark}
              onChange={(e) => handleBenchmarkChange(e.target.value)}
              className="text-xs font-mono px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300"
              data-testid="analytics-benchmark-select"
            >
              {BENCHMARK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setRange(r.label)}
                  className={`text-xs font-mono px-2.5 py-1 rounded-md transition-colors ${
                    range === r.label ? "bg-zinc-100 text-zinc-950 font-medium" : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#71717a" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#71717a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="ts" tickFormatter={fmtDateShort} tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={60} />
              <YAxis tickFormatter={(v) => fmtVal(v)} tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="cost"  name={t("analytics.cost_label")  || "Invested"}  stroke="#52525b" strokeWidth={1.5} fill="url(#gradCost)"  dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="value" name={t("analytics.value_label") || "Portfolio"} stroke="#3b82f6" strokeWidth={2}   fill="url(#gradValue)" dot={false} isAnimationActive={false} />
              {showBenchmark && (
                <Line type="monotone" dataKey="benchmark" name={benchmarkLabel} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Lado a lado em ecrãs md+ (7 jul 2026) — os dois cards em coluna
          única ocupavam demasiada altura; cada um sozinho é pequeno
          (poucas linhas), faz sentido partilharem a linha. Em mobile
          continuam empilhados (grid-cols-1). */}
      {((wVisible("class_returns") && data.class_returns && Object.keys(data.class_returns).length > 0) ||
        (wVisible("fees") && (data.fees_all_time_usd ?? 0) > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wVisible("class_returns") && data.class_returns && Object.keys(data.class_returns).length > 0 && (
            <ClassReturnsCard
              classReturns={data.class_returns}
              totalReturnPct={m.total_return_pct}
              benchmarkReturnPct={bm.total_return_pct}
              benchmarkLabel={benchmarkLabel}
              t={t}
            />
          )}

          {wVisible("fees") && (data.fees_all_time_usd ?? 0) > 0 && (
            <FeesCard
              feesThisYear={data.fees_this_year_usd}
              feesAllTime={data.fees_all_time_usd}
              portfolioValue={filtered[filtered.length - 1]?.value}
              fmtVal={fmtVal}
              t={t}
            />
          )}
        </div>
      )}

      {wVisible("returns") && (m.months?.length > 0 || m.weeks?.length > 0 || m.years?.length > 0) && (
        <ReturnsBarchart m={m} t={t} currency={currency} benchmarkMetrics={data.benchmark_metrics || {}} />
      )}

      {wVisible("heatmap") && m.months?.length > 1 && (
        <HeatmapChart months={m.months} t={t} />
      )}

      {wVisible("histogram") && m.months?.length > 3 && (
        <HistogramChart m={m} t={t} />
      )}

      {wVisible("dividends") && <DividendsSection walletId={walletId} currency={currency} t={t} />}
      {wVisible("tax_report") && <TaxReportSection walletId={walletId} currency={currency} t={t} />}
      <AnalyticsWidgetDrawer
        open={widgetDrawer}
        onClose={() => setWidgetDrawer(false)}
        widgetConfig={widgetConfig}
        setWidgetConfig={setWidgetConfig}
        widgetDefs={ANALYTICS_WIDGET_DEFS}
      />
    </div>
  );
}

// Retornos por classe de ativo (7 jul 2026) — complementa o único número
// "vs benchmark" com uma quebra por tipo (ações/ETFs/cripto/...), mais o
// total da carteira e o benchmark escolhido lado a lado. Vem de
// data.class_returns (backend), um retorno simples (valor atual vs. custo),
// não uma série temporal — por isso é uma lista curta, não um gráfico.
function ClassReturnsCard({ classReturns, totalReturnPct, benchmarkReturnPct, benchmarkLabel, t }) {
  const rows = Object.entries(classReturns).map(([cls, pct]) => ({
    label: t(ALLOCATION_CLASS_LABEL_KEY[cls] || `common.${cls}`) || cls,
    pct,
  }));
  rows.sort((a, b) => b.pct - a.pct);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      <div className="text-sm font-medium text-zinc-200 mb-4">
        {t("analytics.class_returns_title") || "Returns by asset class"}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm font-mono">
            <span className="text-zinc-400">{r.label}</span>
            <span className={r.pct >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtPct(r.pct)}</span>
          </div>
        ))}
        <div className="border-t border-zinc-800 my-2" />
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-200 font-medium">{t("analytics.class_total") || "Total portfolio"}</span>
          <span className={(totalReturnPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtPct(totalReturnPct ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-500">{`${t("analytics.class_benchmark") || "Benchmark"} (${benchmarkLabel})`}</span>
          <span className="text-zinc-400">{fmtPct(benchmarkReturnPct ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

// Transparência de comissões (7 jul 2026) — soma o campo fee já gravado em
// cada transação (data.fees_this_year_usd/fees_all_time_usd, calculado no
// backend); só um "quanto já pagaste", sem tentar obter o TER de cada
// ETF/fundo (isso exigiria uma fonte de dados externa que não temos hoje).
function FeesCard({ feesThisYear, feesAllTime, portfolioValue, fmtVal, t }) {
  const pct = portfolioValue > 0 ? Math.min(100, (feesAllTime / portfolioValue) * 100) : 0;
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
      <div className="text-sm font-medium text-zinc-200 mb-4">
        {t("analytics.fees_title") || "Fee transparency"}
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-400">{t("analytics.fees_this_year") || "Paid this year"}</span>
          <span className="text-rose-400">{fmtVal(feesThisYear)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-mono">
          <span className="text-zinc-400">{t("analytics.fees_all_time") || "Paid in total"}</span>
          <span className="text-rose-400">{fmtVal(feesAllTime)}</span>
        </div>
        {portfolioValue > 0 && (
          <div className="pt-1">
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-1.5">
              {(t("analytics.fees_pct_of_portfolio") || "{pct}% of current portfolio value").replace("{pct}", pct.toFixed(2))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnsBarchart({ m, t, currency, benchmarkMetrics }) {
  const [period, setPeriod] = useState("month");

  const PERIODS = [
    { key: "week",  label: t("analytics.period_weekly")  || "Weekly"  },
    { key: "month", label: t("analytics.period_monthly") || "Monthly" },
    { key: "year",  label: t("analytics.period_annual")  || "Annual"  },
  ];

  const rawData = period === "week"  ? (m.weeks  || [])
                : period === "year"  ? (m.years  || [])
                : (m.months || []);

  const data = period === "week"  ? rawData.slice(-52)
             : period === "month" ? rawData.slice(-24)
             : rawData;

  const labelKey = period === "week" ? "week" : period === "year" ? "year" : "month";

  const spyLookup = useMemo(() => {
    const src = period === "week"  ? (benchmarkMetrics.weeks  || [])
              : period === "year"  ? (benchmarkMetrics.years  || [])
              : (benchmarkMetrics.months || []);
    const map = {};
    for (const e of src) {
      const key = e.month || e.week || e.year;
      if (key) map[key] = e.pct;
    }
    return map;
  }, [benchmarkMetrics, period]);

  const cumulData = useMemo(() => {
    let cum = 0;
    return data.map((d) => {
      cum = cum === 0 ? d.pct : ((1 + cum / 100) * (1 + d.pct / 100) - 1) * 100;
      const key = d[labelKey];
      return { ...d, cum: Math.round(cum * 100) / 100, spyPct: spyLookup[key] ?? null };
    });
  }, [data, labelKey, spyLookup]);

  const best  = data.length ? data.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = data.length ? data.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const cs    = curSymbol(currency);

  const exportCsv = () => {
    const header = [labelKey, "return_pct", "abs_usd", "cumulative_pct"].join(",");
    const rows = cumulData.map((d) => [d[labelKey], d.pct, d.abs ?? "", d.cum].join(","));
    const csv  = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `wallet76-${period}-returns.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 10 jul 2026 — o "radius" do <Bar> é aplicado sempre aos MESMOS 2 cantos
  // (topo do retângulo desenhado), mas para uma barra negativa o "topo" do
  // retângulo em SVG é a própria linha de zero (a barra cresce para baixo).
  // Isso arredondava o canto junto à baseline nos meses negativos — um
  // pequeno recorte a deixar o fundo preto à mostra mesmo onde o vermelho
  // devia estar cheio/visível — e deixava o canto solto na ponta (longe do
  // eixo) reto. Com esta forma própria, o arredondamento fica sempre na
  // ponta mais afastada do eixo (como nas barras positivas), e a baseline
  // fica sempre reta e totalmente preenchida a vermelho/verde.
  const DivergingBar = (props) => {
    const { x, y, width, height, fill } = props;
    const r = Math.min(3, Math.abs(height) / 2, width / 2);
    const isNeg = height >= 0 ? false : true; // recharts pode dar height negativo consoante a versão
    // Normaliza para retângulo com y0 = topo real, h = altura absoluta.
    const top = isNeg ? y + height : y;
    const h = Math.abs(height);
    const negative = props.payload ? props.payload.pct < 0 : isNeg;
    const d = negative
      ? `M${x},${top} L${x + width},${top} L${x + width},${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} L${x + r},${top + h} Q${x},${top + h} ${x},${top + h - r} Z`
      : `M${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${top + h} L${x},${top + h} Z`;
    return <path d={d} fill={fill} fillOpacity={negative ? 1 : 0.85} />;
  };

  const BarLabel = ({ x, y, width, height, value }) => {
    // Antes escondia a label sempre que a barra tinha menos de 14px de
    // altura — o que apaga a percentagem exatamente nos retornos pequenos
    // (ex.: -0.4%), que são os que ficam pertinho do zero. É aí que o
    // utilizador mais precisa de ver o número (7 jul 2026: "os negativos
    // ficam sempre perto do zero... não se vê a percentagem"). Mantém-se só
    // a guarda de largura (barras muito estreitas em períodos longos, onde
    // o texto ficaria a sobrepor a barra vizinha).
    if (Math.abs(width) < 14) return null;
    // 11 jul 2026 (5ª volta) — as voltas 3 e 4 assumiam que, para uma barra
    // negativa, o "y" que o Recharts passa ao LabelList é sempre o pixel da
    // baseline (0%), constante para todas as barras — mas o utilizador
    // confirmou por screenshot que os labels negativos continuavam a
    // subir/descer conforme a percentagem de cada barra, ou seja essa
    // suposição estava errada nesta versão/configuração (possivelmente por
    // causa do "shape" custom do DivergingBar a alterar como o LabelList
    // deriva a geometria). Correção à prova disto: em vez de confiar em
    // qual de "y" é a baseline, calcula-se sempre o MENOR dos dois pixels
    // do retângulo da barra (y e y+height) — esse é, por definição, sempre
    // o pixel mais alto (mais perto do topo do ecrã) dos dois extremos de
    // uma barra negativa, ou seja sempre a baseline (0%), seja qual for a
    // convenção usada internamente. Assim o offset fixo de 28px acima
    // desse ponto fica garantidamente igual em todas as barras negativas,
    // independente da percentagem ou do tamanho da barra. 28px ficava
    // longe de mais da linha de zero (pedido: "quase encostadas ao 0%,
    // tipo encostadas ao 1% positivo ou 0,5%") — reduzido para 9px, só o
    // suficiente para não tocar no traço do eixo/na própria barra.
    let pos;
    if (value >= 0) {
      pos = y - 3;
    } else {
      const baselineY = Math.min(y, y + height);
      pos = baselineY - 5;
    }
    return (
      <text x={x + width / 2} y={pos} textAnchor="middle" fontSize={9} fontFamily="monospace"
        fill={value >= 0 ? "#6ee7b7" : "#fca5a5"}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </text>
    );
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{t("analytics.monthly_returns") || "Returns"}</span>
          <Tip text={t("analytics.returns_tooltip") || "Bars = period return (green/red). Purple line = cumulative return since start. Amber dashed = SPY for same periods."}>
            <Info className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
          </Tip>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            title={t("analytics.export_csv") || "Export CSV"}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <div className="flex border border-zinc-800 rounded-md overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 text-[10px] font-mono transition-colors ${
                  period === p.key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-zinc-600 text-sm font-mono">
          {t("analytics.no_period_data") || "Not enough data"}
        </div>
      ) : (
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={cumulData} margin={{ top: 18, right: 36, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey={labelKey}
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={period === "week" ? 28 : 16}
              />
              <YAxis yAxisId="pct" domain={[(min) => min - 4, (max) => max + 4]} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
              <YAxis yAxisId="cum" orientation="right" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fill: "#a1a1aa", fontSize: 9 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const getColor = (p) => {
                    if (p.dataKey === "pct") return p.value >= 0 ? "#10b981" : "#ef4444";
                    if (p.dataKey === "spyPct") return "#f59e0b";
                    if (p.dataKey === "cum") return "#a78bfa";
                    return "#d4d4d8";
                  };
                  return (
                    <div style={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, fontFamily: "monospace", padding: "8px 12px", minWidth: 140 }}>
                      <div style={{ color: "#71717a", marginBottom: 6, fontSize: 10 }}>{label}</div>
                      {payload.map((p) => {
                        if (p.value == null) return null;
                        const color = getColor(p);
                        let display;
                        if (p.dataKey === "pct") {
                          const entry = cumulData.find((d) => d.pct === p.value);
                          const absVal = entry?.abs != null ? ` · ${p.value >= 0 ? "+" : ""}${cs}${Math.abs(entry.abs).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "";
                          display = `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%${absVal}`;
                        } else {
                          display = `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%`;
                        }
                        return (
                          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ color: "#71717a" }}>{p.name}:</span>
                            <span style={{ color }}>{display}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Bar yAxisId="pct" dataKey="pct" name={t("analytics.return") || "Return"} shape={<DivergingBar />} isAnimationActive={false} maxBarSize={40}>
                {cumulData.map((entry, i) => (
                  <Cell key={i} fill={entry.pct >= 0 ? "#10b981" : "#ef4444"} />
                ))}
                <LabelList content={<BarLabel />} />
              </Bar>
              <Line yAxisId="pct" type="linear" dataKey="spyPct" name="SPY" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3, fill: "#f59e0b" }} isAnimationActive={false} connectNulls />
              <Line yAxisId="cum" type="monotone" dataKey="cum" name={t("analytics.cumulative") || "Cumulative"} stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#a78bfa" }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="px-5 pb-4 flex items-center gap-4 flex-wrap">
        {best && (
          <div className="text-xs font-mono">
            <span className="text-zinc-400">{t("analytics.best_month") || "Best"}: </span>
            <span className="text-emerald-400">
              {best[labelKey]} +{best.pct.toFixed(1)}%
              {best.abs != null ? ` (${cs}${best.abs >= 0 ? "+" : ""}${best.abs.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : ""}
            </span>
          </div>
        )}
        {worst && (
          <div className="text-xs font-mono">
            <span className="text-zinc-400">{t("analytics.worst_month") || "Worst"}: </span>
            <span className="text-red-400">
              {worst[labelKey]} {worst.pct.toFixed(1)}%
              {worst.abs != null ? ` (${cs}${worst.abs >= 0 ? "+" : ""}${worst.abs.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function HeatmapChart({ months, t }) {
  const { grid, years, maxAbs } = useMemo(() => {
    const grid = {};
    let maxAbs = 1;
    for (const e of months) {
      const [yr, mo] = e.month.split("-");
      if (!grid[yr]) grid[yr] = {};
      grid[yr][parseInt(mo)] = e;
      if (Math.abs(e.pct) > maxAbs) maxAbs = Math.abs(e.pct);
    }
    return { grid, years: Object.keys(grid).sort(), maxAbs };
  }, [months]);

  const cellStyle = (pct) => {
    if (pct == null) return { background: "rgba(39,39,42,0.3)" };
    const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
    return pct > 0
      ? { background: `rgba(16,185,129,${(0.12 + intensity * 0.65).toFixed(2)})` }
      : { background: `rgba(239,68,68,${(0.12 + intensity * 0.65).toFixed(2)})` };
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{t("analytics.heatmap_title") || "Monthly Returns Heatmap"}</span>
          <Tip text={t("analytics.heatmap_tooltip") || "Each cell is one month's return. Darker green = stronger gain; darker red = bigger loss. YTD column = cumulative return for that year."}>
            <Info className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
          </Tip>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(239,68,68,0.6)" }} />
          {t("analytics.heatmap_neg") || "Loss"}
          <span className="w-3 h-3 rounded-sm inline-block ml-1" style={{ background: "rgba(16,185,129,0.6)" }} />
          {t("analytics.heatmap_pos") || "Gain"}
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-[10px] font-mono border-separate border-spacing-y-1">
          <thead>
            <tr>
              <th className="text-zinc-400 text-left pr-3 font-normal w-10"></th>
              {MONTH_LABELS.map((ml) => (
                <th key={ml} className="text-zinc-400 font-normal text-center pb-1">{ml}</th>
              ))}
              <th className="text-zinc-400 font-normal text-center pl-2 pb-1">{t("analytics.heatmap_total") || "YTD"}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr) => {
              let annualCum = 0;
              for (let mo = 1; mo <= 12; mo++) {
                const e = grid[yr] && grid[yr][mo];
                if (e) annualCum = ((1 + annualCum / 100) * (1 + e.pct / 100) - 1) * 100;
              }
              return (
                <tr key={yr}>
                  <td className="text-zinc-400 pr-3 py-0.5">{yr}</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
                    const e = grid[yr] && grid[yr][mo];
                    return (
                      <td
                        key={mo}
                        title={e ? `${e.month}: ${e.pct >= 0 ? "+" : ""}${e.pct.toFixed(2)}%` : "—"}
                        style={cellStyle(e ? e.pct : null)}
                        className="text-center rounded px-1 py-0.5 cursor-default hover:opacity-80 transition-opacity"
                      >
                        <span style={{ color: !e ? "#52525b" : e.pct > 0 ? "#6ee7b7" : "#fca5a5" }}>
                          {e ? `${e.pct >= 0 ? "+" : ""}${e.pct.toFixed(1)}` : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-center pl-2 rounded" style={cellStyle(annualCum)}>
                    <span style={{ color: annualCum > 0 ? "#6ee7b7" : "#fca5a5" }}>
                      {annualCum >= 0 ? "+" : ""}{annualCum.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistogramChart({ m, t }) {
  const [period, setPeriod] = useState("month");

  const PERIODS = [
    { key: "week",  label: t("analytics.period_weekly")  || "Weekly"  },
    { key: "month", label: t("analytics.period_monthly") || "Monthly" },
    { key: "year",  label: t("analytics.period_annual")  || "Annual"  },
  ];

  const rawData = period === "week"  ? (m.weeks  || [])
                : period === "year"  ? (m.years  || [])
                : (m.months || []);

  const histData = useMemo(() => HIST_BANDS.map((band) => ({
    label:    band.label,
    count:    rawData.filter((d) => d.pct > band.min && d.pct <= band.max).length,
    positive: band.pos,
  })), [rawData]);

  const total = rawData.length;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{t("analytics.histogram_title") || "Returns Distribution"}</span>
          <Tip text={t("analytics.histogram_tooltip") || "Frequency of returns by magnitude — how often your portfolio fell or rose by each amount. A bell shape centred on positive values is ideal."}>
            <Info className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
          </Tip>
        </div>
        <div className="flex border border-zinc-800 rounded-md overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-[10px] font-mono transition-colors ${
                period === p.key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="h-44 flex items-center justify-center text-zinc-600 text-sm font-mono">
          {t("analytics.no_period_data") || "Not enough data"}
        </div>
      ) : (
        <div className="p-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={histData} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, fontFamily: "monospace", color: "#d4d4d8" }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "#d4d4d8" }}
                formatter={(value) => [`${value} ${t("analytics.histogram_periods") || "periods"}`, t("analytics.histogram_count") || "Count"]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={48}>
                {histData.map((entry, i) => (
                  <Cell key={i} fill={entry.positive ? "#10b981" : "#ef4444"} fillOpacity={0.8} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="px-5 pb-3 text-[10px] font-mono text-zinc-600">
        {total} {t("analytics.histogram_total") || "periods analysed"}
      </div>
    </div>
  );
}

// Relatório fiscal (7 jul 2026) — ganhos/perdas realizados por ano civil e
// por ativo. O aviso (disclaimer) é fixo no topo, sempre visível, NUNCA um
// tooltip/rodapé pequeno que dá para ignorar — pedido explícito: "temos
// que mostrar aviso" sobre as regras variarem por país/ano e isto não
// substituir um contabilista em casos complexos.
function TaxReportSection({ walletId, currency, t }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const sym = curSymbol(currency);
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = walletId && walletId !== "all" ? { wallet_id: walletId } : {};
    api.get("/analytics/tax-report", { params })
      .then((r) => { if (!cancelled) { setData(r.data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [walletId]);

  const exportCsv = () => {
    if (!data?.years?.length) return;
    const header = ["year", "asset_type", "symbol", "realized_usd"].join(",");
    const rows = data.years.flatMap((y) => y.by_asset.map((a) => [y.year, a.asset_type, a.symbol, a.realized_usd].join(",")));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallet76-tax-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-zinc-200">{t("analytics.tax_report_title") || "Tax report"}</span>
        {data?.years?.length > 0 && (
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
            data-testid="tax-report-export-csv"
          >
            <Download className="w-3.5 h-3.5" /> {t("analytics.export_csv") || "Export CSV"}
          </button>
        )}
      </div>

      {/* Aviso fixo — não é dispensável, não é um tooltip. */}
      <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          {t("analytics.tax_report_disclaimer") ||
            "Rules vary by country and change every year. This report is a starting point, not tax advice — always confirm with an accountant, especially in complex cases."}
        </p>
      </div>

      {!data?.years?.length ? (
        <div className="px-5 py-8 text-center text-zinc-500 text-sm font-mono">
          {t("analytics.tax_report_no_data") || "No realized gains/losses yet"}
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {data.years.map((y) => (
            <div key={y.year} className="border border-zinc-800/50 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60">
                <span className="text-sm font-mono text-zinc-200">{y.year}</span>
                <span className={`text-sm font-mono ${y.total_realized_usd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmt(y.total_realized_usd)}
                </span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {y.by_asset.map((a) => (
                  <div key={`${y.year}-${a.symbol}`} className="flex items-center justify-between px-4 py-2 text-xs font-mono">
                    <span className="text-zinc-400">{a.symbol}</span>
                    <span className={a.realized_usd >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmt(a.realized_usd)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FREQ_LABEL = {
  "monthly":    { key: "analytics.dividends_freq_monthly",    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  "quarterly":  { key: "analytics.dividends_freq_quarterly",  color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  "semi-annual":{ key: "analytics.dividends_freq_semiannual", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  "annual":     { key: "analytics.dividends_freq_annual",     color: "bg-zinc-700/40 text-zinc-400 border-zinc-600/40" },
};

function DividendsSection({ walletId, currency, t }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const sym = curSymbol(currency);
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtS = (n) => `${sym}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = walletId && walletId !== "all" ? { wallet_id: walletId } : {};
    api.get("/analytics/dividends", { params })
      .then((r) => { if (!cancelled) { setData(r.data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [walletId]);

  if (loading) return null;
  if (!data?.dividends?.length) return null;

  const { dividends, total_annual_income, total_received } = data;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{t("analytics.dividends_title") || "Dividend Income"}</span>
          <Tip text={t("analytics.dividends_tooltip") || "Estimated annual dividend income based on current holdings and each asset's trailing dividend rate."}>
            <Info className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
          </Tip>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-400">{t("analytics.dividends_annual") || "Est. Anual"}: </span>
            <span className="text-emerald-400">{fmt(total_annual_income)}</span>
          </div>
          <div>
            <span className="text-zinc-400">{t("analytics.dividends_received") || "Total Recebido"}: </span>
            <span className="text-zinc-300">{fmt(total_received)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800/50 text-zinc-400 uppercase tracking-[0.1em]">
              <th className="text-left px-5 py-3 font-normal">{t("common.asset") || "Ativo"}</th>
              <th className="text-left px-4 py-3 font-normal">{t("analytics.dividends_freq") || "Frequência"}</th>
              <th className="text-left px-4 py-3 font-normal">{t("analytics.dividends_months") || "Meses"}</th>
              <th className="text-right px-4 py-3 font-normal">{t("analytics.dividends_yield") || "Yield"}</th>
              <th className="text-right px-4 py-3 font-normal">{t("analytics.dividends_per_payment") || "Por pag."}</th>
              <th className="text-right px-4 py-3 font-normal">{t("analytics.dividends_annual") || "Anual Est."}</th>
              <th className="text-right px-4 py-3 font-normal">{t("analytics.dividends_received") || "Recebido"}</th>
            </tr>
          </thead>
          <tbody>
            {dividends.map((d) => {
              const freqInfo = FREQ_LABEL[d.frequency] || FREQ_LABEL["quarterly"];
              return (
                <tr key={d.symbol} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-200 font-medium">{d.symbol}</span>
                      {d.years_paying >= 25 && (
                        <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#f59e0b" }} title={`${d.years_paying}y`} />
                      )}
                      {d.years_paying >= 10 && d.years_paying < 25 && (
                        <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#94a3b8" }} title={`${d.years_paying}y`} />
                      )}
                    </div>
                    {d.name && d.name !== d.symbol && (
                      <div className="text-zinc-600 text-[10px] truncate max-w-[120px]">{d.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-mono ${freqInfo.color}`}>
                      {t(freqInfo.key)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {d.pay_months && d.pay_months.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {d.pay_months.map((m) => {
                          const day = d.pay_month_days?.[m];
                          return (
                            <span key={m} className="inline-flex flex-col items-center px-1.5 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50" style={{ minWidth: 28 }}>
                              <span className="text-[10px] text-zinc-400 leading-tight">{m}</span>
                              {day && <span className="text-[9px] text-zinc-600 leading-tight">{day}</span>}
                            </span>
                          );
                        })}
                      </div>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400">
                    {d.yield_pct != null ? `${d.yield_pct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300">
                    {d.rate_per_payment != null ? fmtS(d.rate_per_payment) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400">{fmt(d.annual_income)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{fmt(d.total_received)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-zinc-800/30 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-mono text-zinc-600 flex items-center gap-1">
          <Banknote className="w-3 h-3 flex-shrink-0" />
          {t("analytics.dividends_disclaimer") || "Dividend data sourced from Yahoo Finance. For informational purposes only."}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
          <span className="flex items-center gap-1">
            <Crown className="w-3 h-3" style={{ color: "#f59e0b" }} />
            {t("analytics.dividends_crown_gold") || "25+ anos"}
          </span>
          <span className="flex items-center gap-1">
            <Crown className="w-3 h-3" style={{ color: "#94a3b8" }} />
            {t("analytics.dividends_crown_silver") || "10+ anos"}
          </span>
        </div>
      </div>
    </div>
  );
}

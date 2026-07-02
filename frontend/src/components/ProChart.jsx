import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

// Shared professional candlestick chart — every price/portfolio chart in the
// app (AssetChart, AssetDetail, Dashboard) renders through this one
// component. Built on TradingView's Lightweight Charts (the open-source
// engine real trading platforms use), replacing the old hand-rolled
// Recharts candle hack.
//
// `data` must be OHLC candles ascending by time: [{ t: <ms>, o, h, l, c }, ...]
//
// Points are re-indexed onto a synthetic, evenly-spaced axis (1 unit per
// candle) instead of real elapsed time — this is Lightweight Charts' own
// documented recipe for "no gaps" charts. A closed weekend or overnight gap
// simply isn't allocated any width, so there's never an artificial flat
// line stretched across dead time. The x-axis tick labels and the OHLC
// legend look up the REAL timestamp behind each synthetic index to display.
const LEGEND_H = 28;

export default function ProChart({ data, height = 320, formatValue = (v) => v, showDate = false }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const realTimesRef = useRef([]);
  const [hoverCandle, setHoverCandle] = useState(null);

  // Chart lifecycle — created once per mount (and whenever the tick label
  // format needs to change between time-of-day and calendar-date mode).
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#71717a",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(161,161,170,0.4)", width: 1, style: 3, labelBackgroundColor: "#3f3f46" },
        horzLine: { color: "rgba(161,161,170,0.4)", width: 1, style: 3, labelBackgroundColor: "#3f3f46" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        rightOffset: 2,
        tickMarkFormatter: (time) => {
          const real = realTimesRef.current[time];
          if (real == null) return "";
          const d = new Date(real);
          return showDate
            ? d.toLocaleDateString([], { month: "short", day: "numeric" })
            : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const d = param.time != null ? param.seriesData?.get(series) : null;
      if (!d) { setHoverCandle(null); return; }
      setHoverCandle({ o: d.open, h: d.high, l: d.low, c: d.close, t: realTimesRef.current[param.time] });
    });

    return () => chart.remove();
  }, [showDate]);

  // Data updates — re-map to the synthetic index axis and refit the view.
  useEffect(() => {
    if (!seriesRef.current) return;
    const pts = (data || []).filter(
      (d) => [d.o, d.h, d.l, d.c].every((v) => v != null && !Number.isNaN(v))
    );
    realTimesRef.current = pts.map((d) => d.t);
    seriesRef.current.setData(
      pts.map((d, i) => ({ time: i, open: d.o, high: d.h, low: d.l, close: d.c }))
    );
    chartRef.current?.timeScale().fitContent();
    setHoverCandle(null);
  }, [data]);

  const last = data && data.length ? data[data.length - 1] : null;
  const legend = hoverCandle || (last ? { o: last.o, h: last.h, l: last.l, c: last.c, t: last.t } : null);
  const up = legend ? legend.c >= legend.o : true;
  // Colored by the candle's own direction (green/red) — never a black or
  // dark-gray panel, per the app's chart tooltip requirement.
  const bg = up ? "#10b981" : "#ef4444";
  const fg = up ? "#022c1e" : "#450a0a";

  return (
    <div style={{ width: "100%", height }}>
      <div style={{ height: LEGEND_H }} className="flex items-center">
        {legend ? (
          <div
            className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-2.5 py-1 rounded-lg"
            style={{ background: bg, color: fg, fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600 }}
          >
            <span style={{ opacity: 0.85 }}>{new Date(legend.t).toLocaleString()}</span>
            <span>O {formatValue(legend.o)}</span>
            <span>H {formatValue(legend.h)}</span>
            <span>L {formatValue(legend.l)}</span>
            <span>C {formatValue(legend.c)}</span>
          </div>
        ) : null}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: `calc(100% - ${LEGEND_H}px)` }} />
    </div>
  );
}

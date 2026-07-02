import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useI18n } from "../context/I18nContext";

/**
 * Stable-width flashing price with status dot.
 * Dot colours:
 *   live=true              → green pulsing  (crypto realtime via Binance WS)
 *   live=false, open=true  → green static   (market open)
 *   live=false, open=false → zinc           (market closed)
 */
export default function FlashingPrice({
  value,
  formatted,
  live = false,
  marketOpen = true,
  showDot = true,
  className = "",
  testId,
}) {
  const { t } = useI18n();
  const [dir, setDir] = useState(null); // 'up' | 'down' | null
  const prevRef = useRef(value);

  useEffect(() => {
    if (value == null || isNaN(value)) return;
    const prev = prevRef.current;
    if (prev != null && !isNaN(prev) && prev !== value) {
      setDir(value > prev ? "up" : "down");
      const timer = setTimeout(() => setDir(null), 1500);
      prevRef.current = value;
      return () => clearTimeout(timer);
    }
    prevRef.current = value;
  }, [value]);

  const colorCls =
    dir === "up"
      ? "text-emerald-400 bg-emerald-500/10"
      : dir === "down"
      ? "text-rose-400 bg-rose-500/10"
      : "text-zinc-400";

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors duration-300 ${colorCls} ${dir ? "flash-pulse" : ""} ${className}`}
    >
      <span className="inline-flex w-3 h-3 shrink-0 items-center justify-center">
        {dir === "up" && <ArrowUp className="w-3 h-3" />}
        {dir === "down" && <ArrowDown className="w-3 h-3" />}
      </span>
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            live ? "bg-emerald-400 animate-pulse" :
            marketOpen ? "bg-emerald-500" :
            "bg-zinc-600"
          }`}
          title={live ? t("dash.live") : marketOpen ? t("dash.delayed") : t("dash.market_closed")}
        />
      )}
      <span className="font-mono">{formatted ?? "—"}</span>
    </span>
  );
}

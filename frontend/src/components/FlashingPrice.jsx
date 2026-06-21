import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

/**
 * Stable-width flashing price.
 * - Reserves fixed width for the arrow icon (invisible when neutral) so layout never shifts.
 */
export default function FlashingPrice({ value, formatted, live = false, className = "", testId }) {
  const [dir, setDir] = useState(null); // 'up' | 'down' | null
  const prevRef = useRef(value);

  useEffect(() => {
    if (value == null || isNaN(value)) return;
    const prev = prevRef.current;
    if (prev != null && !isNaN(prev) && prev !== value) {
      setDir(value > prev ? "up" : "down");
      const t = setTimeout(() => setDir(null), 1500);
      prevRef.current = value;
      return () => clearTimeout(t);
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
        {dir === "up" && <ArrowUp className="w-3 h-3"/>}
        {dir === "down" && <ArrowDown className="w-3 h-3"/>}
      </span>
      <span className="font-mono tabular-nums">{formatted}</span>
      {live && (
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live"/>
      )}
    </span>
  );
}

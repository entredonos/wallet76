import React from "react";
import { TINT_CLASSES } from "../../constants/dashboardConstants";

// Module-level so React keeps its identity across Dashboard re-renders
// (was previously defined inside Dashboard.jsx, same reasoning as
// TopMoverRow below it in this same directory).
export default function SummaryCard({ icon, label, value, delta, positive, testId, tint = "zinc", sparkline }) {
  const tc = TINT_CLASSES[tint] || TINT_CLASSES.zinc;
  return (
    <div
      data-testid={testId}
      className={`relative flex flex-col gap-3 rounded-xl border bg-zinc-900/60 p-4 backdrop-blur-sm hover:bg-zinc-900/80 transition-colors ${tc.border}`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${tc.icon}`}>
          {icon}
        </div>
        {sparkline && (
          <div className="opacity-70">{sparkline}</div>
        )}
      </div>
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.12em] text-zinc-500 mb-1">{label}</div>
        <div className="text-xl font-semibold text-zinc-100 font-mono truncate">{value}</div>
        {delta != null && (
          // No extra "+" prepended here — every caller already formats delta
          // via fmtPct() (or a string built from it), which adds its own "+"
          // sign for positive values. Doing it again here doubled up to
          // "++2.2%" on every positive card.
          <div className={`text-xs font-mono mt-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

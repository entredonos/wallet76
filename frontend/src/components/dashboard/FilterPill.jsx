import React from "react";

export default function FilterPill({ active, onClick, children, testId, color = "zinc", coloredBorder = false, inactiveColor }) {
  const colors = {
    zinc:    active ? "bg-zinc-100 text-zinc-950 border-zinc-100"    : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200",
    amber:   active ? "bg-amber-400/20 text-amber-300 border-amber-400/60"   : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-amber-500/40 hover:text-amber-300",
    blue:    active ? "bg-blue-500/20 text-blue-300 border-blue-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-blue-500/40 hover:text-blue-300",
    purple:  active ? "bg-purple-500/20 text-purple-300 border-purple-500/60"   : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-purple-500/40 hover:text-purple-300",
    emerald: active ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60" : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-emerald-500/40 hover:text-emerald-300",
    rose:    active ? "bg-rose-500/20 text-rose-300 border-rose-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-rose-500/40 hover:text-rose-300",
    cyan:    active ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-cyan-500/40 hover:text-cyan-300",
  };
  // Inactive-but-colored variant: same border/text tint as the active state
  // (just dimmer), instead of the generic zinc border that only picks up
  // color on hover. Used by the wallet pills and their inline type pills,
  // so a wallet's color is visible at a glance even when it isn't selected.
  const coloredInactive = {
    zinc:    "bg-zinc-900/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200",
    amber:   "bg-zinc-900/60 text-amber-300 border-amber-500 hover:border-amber-400 hover:text-amber-200",
    blue:    "bg-zinc-900/60 text-blue-300 border-blue-500 hover:border-blue-400 hover:text-blue-200",
    purple:  "bg-zinc-900/60 text-purple-300 border-purple-500 hover:border-purple-400 hover:text-purple-200",
    emerald: "bg-zinc-900/60 text-emerald-300 border-emerald-500 hover:border-emerald-400 hover:text-emerald-200",
    rose:    "bg-zinc-900/60 text-rose-300 border-rose-500 hover:border-rose-400 hover:text-rose-200",
    cyan:    "bg-zinc-900/60 text-cyan-300 border-cyan-500 hover:border-cyan-400 hover:text-cyan-200",
  };
  const className = active
    ? colors[color] || colors.zinc
    : coloredBorder
      ? coloredInactive[inactiveColor || color] || coloredInactive.zinc
      : colors[color] || colors.zinc;
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

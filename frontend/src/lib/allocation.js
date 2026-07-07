// "UPGRADE v1.0" — asset-class allocation shared helpers.
//
// The classes mirror the asset_type values already used everywhere else in
// the app (stock/crypto/etf/fund/cash/reit) — no new instrument types, no
// comodities/obrigações/imobiliário direto (those have no way to be added
// as a real transaction today).
//
// REIT (7 jul 2026) — já existia como asset_type e já tinha cor/label nas
// tabelas de ativos, mas nunca tinha entrado aqui — o que o deixava invisível
// no pie de distribuição por classe (caía em "Outro") e sem slider próprio
// no diálogo de alvo de alocação. Adicionado para paridade total com os
// outros tipos.

export const ALLOCATION_CLASSES = ["stock", "crypto", "etf", "fund", "cash", "reit"];

// The i18n key for each class's display label (all reuse existing,
// already-translated common.* keys — no duplicate label strings needed).
export const ALLOCATION_CLASS_LABEL_KEY = {
  stock: "common.stocks",
  crypto: "common.crypto",
  etf: "common.etfs",
  fund: "common.funds",
  cash: "common.cash",
  reit: "common.reit",
};

// Fixed class -> color mapping, shared by the Dashboard target-allocation
// widget's dialog affordances and the per-wallet mini-donut (Wallets.jsx,
// "UPGRADE v1.0" task #76) so the same class always reads as the same color
// everywhere in the app, instead of a palette-index that shifts depending
// on sort order. "reit" uses the same orange already used for its badge in
// AssetsTable.jsx (border-orange-500/40) for visual consistency.
export const ALLOCATION_CLASS_COLOR = {
  stock: "#3b82f6",
  crypto: "#eab308",
  etf: "#a855f7",
  fund: "#10b981",
  cash: "#64748b",
  reit: "#f97316",
  other: "#71717a",
};

// A holding's "allocation class" is its manual override (set per-symbol,
// applies across every wallet) if one exists, otherwise its real
// asset_type. `overrides` is the { SYMBOL: class } map from GET /allocation.
export function effectiveClass(asset, overrides) {
  const sym = (asset?.symbol || "").toUpperCase();
  return (overrides && overrides[sym]) || asset?.asset_type;
}

// Aggregates a holdings array into { class: totalValueUsd }, applying
// overrides. Only sums assets with a positive quantity/value (matches how
// the rest of the app treats a fully-sold position).
export function aggregateByClass(holdings, overrides) {
  const totals = {};
  for (const a of holdings || []) {
    const value = Number(a.value_usd || 0);
    if (!value) continue;
    const cls = effectiveClass(a, overrides) || "other";
    totals[cls] = (totals[cls] || 0) + value;
  }
  return totals;
}

// Moves `cls` to `newVal` and redistributes the delta across the other
// classes proportionally to their current weight, so the targets always
// keep summing to 100 — used ONLY by the Dashboard widget's inline sliders
// (the dedicated Target Allocation dialog stays free-edit with its own
// sum validation + explicit Save, per the user's explicit choice: auto
// rebalance here, manual there). `current` is a { class: pct } map:
// missing/unmapped classes are treated as 0.
export function redistributeAllocationTargets(current, cls, newVal) {
  const next = {};
  ALLOCATION_CLASSES.forEach((c) => { next[c] = Number(current?.[c] || 0); });

  const clamped = Math.max(0, Math.min(100, Number(newVal) || 0));
  const delta = clamped - next[cls];
  next[cls] = clamped;
  if (Math.abs(delta) < 1e-9) return next;

  const others = ALLOCATION_CLASSES.filter((c) => c !== cls);
  const othersTotal = others.reduce((s, c) => s + next[c], 0);

  if (othersTotal <= 0) {
    // Nothing to take from / give to proportionally (all others already at
    // 0) — just make sure the total doesn't exceed 100.
    if (delta > 0) next[cls] = Math.min(clamped, 100);
    return next;
  }

  others.forEach((c) => {
    const share = next[c] / othersTotal;
    next[c] = Math.max(0, next[c] - delta * share);
  });

  // Floating point / clamping-at-0 drift correction: nudge the largest
  // "other" class so the 5 values sum to exactly 100.
  const total = ALLOCATION_CLASSES.reduce((s, c) => s + next[c], 0);
  const diff = 100 - total;
  if (Math.abs(diff) > 0.01) {
    const biggest = others.slice().sort((a, b) => next[b] - next[a])[0];
    if (biggest) next[biggest] = Math.max(0, Math.min(100, next[biggest] + diff));
  }

  return next;
}

// Shared per-wallet accent color assignment — a wallet gets the same
// color everywhere it shows up in the app (Dashboard's wallet pills, the
// Top Movers wallet badge, the Wallets page icon border, etc.), assigned
// deterministically by the wallet's position in the `wallets` array (its
// order as returned by the API, i.e. creation order).

export const WALLET_COLOR_KEYS = ["amber", "blue", "purple", "emerald", "rose", "cyan"];

export function walletColorIndex(wallets, walletId) {
  const i = wallets.findIndex((w) => w.id === walletId);
  return i < 0 ? 0 : i % WALLET_COLOR_KEYS.length;
}

export function walletColorKey(wallets, walletId) {
  return WALLET_COLOR_KEYS[walletColorIndex(wallets, walletId)];
}

export const WALLET_DOT_CLASS = {
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  purple: "bg-purple-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  cyan: "bg-cyan-400",
};

export const WALLET_BORDER_CLASS = {
  amber: "border-amber-500/60",
  blue: "border-blue-500/60",
  purple: "border-purple-500/60",
  emerald: "border-emerald-500/60",
  rose: "border-rose-500/60",
  cyan: "border-cyan-500/60",
};

export const WALLET_TEXT_CLASS = {
  amber: "text-amber-300",
  blue: "text-blue-300",
  purple: "text-purple-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  cyan: "text-cyan-300",
};

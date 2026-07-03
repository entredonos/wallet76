// Tiny pub/sub so pages that mutate wallets/alerts/watchlists can nudge
// Layout.jsx's sidebar poll (wallet list, alert badge, watchlist badge,
// per-wallet PnL) to refresh right away, instead of waiting up to 30s for
// the next scheduled tick — which is how long it could take after Layout's
// poll stopped restarting on every navigation (see Layout.jsx for why that
// changed). Deliberately not a full shared-context rewrite: Layout.jsx
// still owns and fetches its own sidebar data, this just lets any page say
// "something changed, refresh now" without coupling Layout to every place
// that can mutate that data.
const listeners = new Set();

export function onSidebarRefreshRequested(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function requestSidebarRefresh() {
  listeners.forEach((fn) => fn());
}

import React from "react";

/** Single animated skeleton row for use inside <tbody> */
export function SkeletonTableRow({ cols = 5 }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 rounded bg-zinc-800 animate-pulse" style={{ width: `${55 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton list matching MoversList's row layout (e.g. Market page, while
 * /market/movers/{crypto,stocks} is still loading — mostly relevant on a
 * cold Render restart, since the background refresher keeps the cache warm
 * otherwise; see run_market_movers_refresher in routes/market.py). */
export function SkeletonMoversList({ rows = 5 }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800/50 flex items-center justify-between animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-24" />
        <div className="h-3 bg-zinc-800 rounded w-5" />
      </div>
      <div className="divide-y divide-zinc-800/30">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
            <div className="w-4 h-3 rounded bg-zinc-800 shrink-0" />
            <div className="h-7 w-7 rounded-full bg-zinc-800 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 bg-zinc-800 rounded w-16" />
              <div className="h-2.5 bg-zinc-800 rounded w-24" />
            </div>
            <div className="h-3 bg-zinc-800 rounded w-14 shrink-0" />
            <div className="h-3 bg-zinc-800 rounded w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for a card grid (e.g. Wallets page) */
export function SkeletonCardGrid({ count = 3 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="border border-zinc-800 rounded-xl p-5 space-y-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-zinc-800" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-zinc-800 rounded w-1/2" />
              <div className="h-3 bg-zinc-800 rounded w-1/3" />
            </div>
          </div>
          <div className="h-6 bg-zinc-800 rounded w-2/3" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
          <div className="flex gap-2 pt-1">
            <div className="h-8 bg-zinc-800 rounded-lg flex-1" />
            <div className="h-8 bg-zinc-800 rounded-lg flex-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

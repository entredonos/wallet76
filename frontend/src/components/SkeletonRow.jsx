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

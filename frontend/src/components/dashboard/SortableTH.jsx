import React from "react";

export default function SortableTH({ label, k, sortKey, sortDir, onSort, testId, className = "text-right px-4 py-3" }) {
  const active = sortKey === k;
  return (
    <th
      className={`font-normal cursor-pointer select-none text-xs font-mono uppercase tracking-[0.15em] ${active ? "text-zinc-200" : "text-zinc-400"} ${className}`}
      onClick={() => onSort(k)}
      data-testid={testId}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

import React from "react";

function Bone({ className = "" }) {
  return (
    <div
      className={`rounded-md bg-zinc-800 animate-pulse ${className}`}
    />
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 fade-in">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-9 w-48" />
          <Bone className="h-3 w-64" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-8 w-8 rounded-md" />
          <Bone className="h-8 w-8 rounded-md" />
          <Bone className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-zinc-800 rounded-xl p-4 space-y-2">
            <Bone className="h-3 w-24" />
            <Bone className="h-7 w-32" />
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <Bone className="h-4 w-32" />
          <div className="flex gap-1">
            {[...Array(6)].map((_, i) => (
              <Bone key={i} className="h-6 w-10 rounded-md" />
            ))}
          </div>
        </div>
        <Bone className="h-48 w-full rounded-lg" />
      </div>

      {/* Filter pills + table */}
      <div className="space-y-3">
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <Bone key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        {/* Table header */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-zinc-800">
            {["w-16", "w-24", "w-20", "w-20", "w-16"].map((w, i) => (
              <Bone key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {/* Table rows */}
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 px-4 py-4 border-b border-zinc-800/50 last:border-0">
              <div className="flex items-center gap-2">
                <Bone className="h-7 w-7 rounded-full" />
                <Bone className="h-3 w-12" />
              </div>
              <Bone className="h-3 w-20" />
              <Bone className="h-3 w-16" />
              <Bone className="h-3 w-16" />
              <Bone className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

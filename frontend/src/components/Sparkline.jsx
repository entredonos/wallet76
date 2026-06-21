import React from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

/**
 * Tiny 24h sparkline.
 * @param {Array<{t,p}>} data
 * @param {boolean} positive  Color hint
 */
export default function Sparkline({ data, positive = true, width = 96, height = 28 }) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="text-[10px] font-mono text-zinc-600 flex items-center justify-end">—</div>;
  }
  const stroke = positive ? "#10b981" : "#ef4444";
  const fillId = `spark-grad-${positive ? "g" : "r"}`;
  return (
    <div style={{ width, height }} className="opacity-90">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.6}/>
              <stop offset="100%" stopColor={stroke} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="p" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

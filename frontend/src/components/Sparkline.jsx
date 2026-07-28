import React from "react";
import { LineChart, Line, YAxis } from "recharts";

/**
 * Tiny 24h sparkline.
 * @param {Array<{t,p}>} data
 * @param {boolean} positive  Color hint
 *
 * 28 jul 2026 — sem ResponsiveContainer. Ele existe para medir o elemento pai
 * e adaptar-se, mas aqui o tamanho JÁ É conhecido: todos os 6 sítios que usam
 * este componente passam largura/altura em pixéis (86×26 nos cartões do
 * Dashboard, 48×20 no LightBalanceCard, 96×28 por omissão nas tabelas). A
 * medição só trazia problemas: quando o pai está escondido — o
 * LightBalanceCard envolve-o num `hidden sm:inline-block`, e abaixo do
 * breakpoint `sm` isso é `display:none` — o ResponsiveContainer mede 0 e a
 * recharts despeja "The width(-1) and height(-1) of chart should be greater
 * than 0" na consola a cada render. Passando as medidas diretamente ao
 * LineChart, salta-se a medição, os avisos desaparecem e poupa-se um
 * ResizeObserver por sparkline (podem ser dezenas na tabela de ativos).
 */
export default function Sparkline({ data, positive = true, width = 96, height = 28 }) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="text-[10px] font-mono text-zinc-600 flex items-center justify-end">—</div>;
  }
  const stroke = positive ? "#10b981" : "#ef4444";
  const fillId = `spark-grad-${positive ? "g" : "r"}`;
  return (
    <div style={{ width, height }} className="opacity-90">
      <LineChart width={width} height={height} data={data} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.6}/>
            <stop offset="100%" stopColor={stroke} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="p" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
      </LineChart>
    </div>
  );
}

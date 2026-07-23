import React from "react";

// Manómetro de agulha clássico (Opção 1, aprovada pelo utilizador 23 jul
// 2026) para o sentimento do mercado. SVG puro, sem dependências. Recebe um
// score 0-100 e uma classificação já resolvida pelo backend
// (extreme_fear…extreme_greed). O rótulo de texto é traduzido pelo pai — este
// componente é só a visualização.
//
// Semicírculo superior: score 0 -> ponta esquerda (180°), 50 -> topo (90°),
// 100 -> ponta direita (0°). 5 arcos coloridos (medo extremo=vermelho …
// ganância extrema=verde), agulha por cima.

import { SEGMENTS, scoreToAngle, polar, arcPath } from "../../lib/gaugeMath";

export default function SentimentGauge({
  score = 0,
  label = "",
  sublabel = "",
  unavailable = false,
  size = 150,
}) {
  const w = size;
  const h = size * 0.64;
  const cx = w / 2;
  const cy = h - 6;
  const r = w / 2 - 12;
  const stroke = Math.max(9, w * 0.075);

  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const needleAngle = scoreToAngle(clamped);
  const tip = polar(cx, cy, r - stroke / 2 - 3, needleAngle);

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width={w}
        height={h + 4}
        viewBox={`0 0 ${w} ${h + 4}`}
        role="img"
        aria-label={`${label}: ${unavailable ? "—" : clamped}`}
      >
        {/* pista de fundo */}
        <path
          d={arcPath(cx, cy, r, 0, 100)}
          fill="none"
          stroke="#27272a"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* segmentos coloridos (esbatidos se indisponível) */}
        {!unavailable &&
          SEGMENTS.map((s) => (
            <path
              key={s.from}
              d={arcPath(cx, cy, r, s.from, s.to)}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              opacity={0.92}
            />
          ))}
        {/* agulha */}
        {!unavailable && (
          <>
            <line
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke="#f4f4f5"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4.5} fill="#f4f4f5" />
            <circle cx={cx} cy={cy} r={2} fill="#18181b" />
          </>
        )}
      </svg>
      <div className="-mt-1 text-center leading-tight">
        <div
          className="text-lg font-semibold tabular-nums"
          style={{ color: unavailable ? "#71717a" : "#f4f4f5" }}
        >
          {unavailable ? "—" : clamped}
        </div>
        {label && (
          <div className="text-[11px] font-medium text-zinc-300">{label}</div>
        )}
        {sublabel && !unavailable && (
          <div className="text-[10px] text-zinc-500">{sublabel}</div>
        )}
        {unavailable && (
          <div className="text-[10px] text-zinc-600">n/d</div>
        )}
      </div>
    </div>
  );
}

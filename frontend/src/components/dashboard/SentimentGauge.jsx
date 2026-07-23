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

const SEGMENTS = [
  { from: 0, to: 20, color: "#ef4444" },   // extreme fear
  { from: 20, to: 40, color: "#f97316" },  // fear
  { from: 40, to: 60, color: "#eab308" },  // neutral
  { from: 60, to: 80, color: "#84cc16" },  // greed
  { from: 80, to: 100, color: "#22c55e" }, // extreme greed
];

// score (0..100) -> ângulo em graus (180 no 0, 0 no 100)
const scoreToAngle = (v) => 180 - (Math.max(0, Math.min(100, v)) / 100) * 180;

// ponto polar no ecrã (y para baixo)
function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arcPath(cx, cy, r, fromScore, toScore) {
  const a1 = scoreToAngle(fromScore); // ângulo maior (mais à esquerda)
  const a2 = scoreToAngle(toScore);
  const p1 = polar(cx, cy, r, a1);
  const p2 = polar(cx, cy, r, a2);
  // large-arc-flag=0 (cada segmento < 180°), sweep-flag=1 (sentido horário
  // no ecrã — esquerda -> topo -> direita fica no semicírculo de cima).
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

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

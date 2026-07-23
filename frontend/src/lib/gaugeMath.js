// Matemática pura do manómetro de agulha (SentimentGauge). Extraída para um
// módulo próprio para poder ser testada isoladamente (gaugeMath.test.js) sem
// montar o componente. Semicírculo superior: score 0 -> ponta esquerda
// (180°), 50 -> topo (90°), 100 -> ponta direita (0°).

export const SEGMENTS = [
  { from: 0, to: 20, color: "#ef4444" },   // extreme fear
  { from: 20, to: 40, color: "#f97316" },  // fear
  { from: 40, to: 60, color: "#eab308" },  // neutral
  { from: 60, to: 80, color: "#84cc16" },  // greed
  { from: 80, to: 100, color: "#22c55e" }, // extreme greed
];

// score (0..100), com clamp -> ângulo em graus (180 no 0, 0 no 100).
export const scoreToAngle = (v) =>
  180 - (Math.max(0, Math.min(100, Number(v) || 0)) / 100) * 180;

// Ponto polar no ecrã (y para baixo, por isso subtrai-se o seno).
export function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

// Caminho SVG de um arco entre dois scores (large-arc=0, sweep=1 -> mantém-se
// no semicírculo de cima, esquerda -> topo -> direita).
export function arcPath(cx, cy, r, fromScore, toScore) {
  const p1 = polar(cx, cy, r, scoreToAngle(fromScore));
  const p2 = polar(cx, cy, r, scoreToAngle(toScore));
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

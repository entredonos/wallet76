import { scoreToAngle, polar, arcPath, SEGMENTS } from "./gaugeMath";

describe("scoreToAngle", () => {
  test("0 -> 180° (ponta esquerda)", () => expect(scoreToAngle(0)).toBe(180));
  test("50 -> 90° (topo)", () => expect(scoreToAngle(50)).toBe(90));
  test("100 -> 0° (ponta direita)", () => expect(scoreToAngle(100)).toBe(0));
  test("25 -> 135°", () => expect(scoreToAngle(25)).toBe(135));
  test("clamp negativo -> 180°", () => expect(scoreToAngle(-20)).toBe(180));
  test("clamp acima de 100 -> 0°", () => expect(scoreToAngle(140)).toBe(0));
  test("valor inválido trata como 0 -> 180°", () => expect(scoreToAngle(undefined)).toBe(180));
});

describe("polar", () => {
  test("180° = esquerda do centro", () => {
    const p = polar(100, 100, 50, 180);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(100);
  });
  test("90° = topo (y sobe)", () => {
    const p = polar(100, 100, 50, 90);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });
  test("0° = direita do centro", () => {
    const p = polar(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(100);
  });
});

describe("arcPath / SEGMENTS", () => {
  test("devolve um caminho SVG de arco", () => {
    const d = arcPath(100, 100, 50, 0, 100);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.includes(" A 50 50 ")).toBe(true);
  });
  test("5 segmentos a cobrir 0..100 sem buracos", () => {
    expect(SEGMENTS).toHaveLength(5);
    expect(SEGMENTS[0].from).toBe(0);
    expect(SEGMENTS[SEGMENTS.length - 1].to).toBe(100);
    for (let i = 1; i < SEGMENTS.length; i++) {
      expect(SEGMENTS[i].from).toBe(SEGMENTS[i - 1].to);
    }
  });
});

import {
  effectiveClass, aggregateByClass, redistributeAllocationTargets,
  ALLOCATION_CLASSES,
} from "./allocation";

describe("effectiveClass", () => {
  test("sem override usa asset_type", () =>
    expect(effectiveClass({ symbol: "BTC", asset_type: "crypto" }, {})).toBe("crypto"));
  test("override por símbolo ganha", () =>
    expect(effectiveClass({ symbol: "AAPL", asset_type: "stock" }, { AAPL: "etf" })).toBe("etf"));
  test("símbolo é normalizado para maiúsculas no override", () =>
    expect(effectiveClass({ symbol: "aapl", asset_type: "stock" }, { AAPL: "etf" })).toBe("etf"));
});

describe("aggregateByClass", () => {
  const H = [
    { symbol: "BTC", asset_type: "crypto", value_usd: 1000 },
    { symbol: "AAPL", asset_type: "stock", value_usd: 500 },
    { symbol: "SOLD", asset_type: "crypto", value_usd: 0 },
  ];
  test("soma por classe e ignora valor zero", () =>
    expect(aggregateByClass(H, {})).toEqual({ crypto: 1000, stock: 500 }));
  test("aplica overrides", () =>
    expect(aggregateByClass(H, { AAPL: "etf" })).toEqual({ crypto: 1000, etf: 500 }));
  test("classe sem asset_type cai em 'other'", () =>
    expect(aggregateByClass([{ symbol: "X", value_usd: 10 }], {})).toEqual({ other: 10 }));
  test("holdings nulo -> {}", () =>
    expect(aggregateByClass(null, {})).toEqual({}));
});

describe("redistributeAllocationTargets", () => {
  const sum = (o) => ALLOCATION_CLASSES.reduce((s, c) => s + o[c], 0);

  test("mover uma classe mantém o total em 100", () => {
    const next = redistributeAllocationTargets({ stock: 50, crypto: 50 }, "crypto", 30);
    expect(next.crypto).toBe(30);
    expect(next.stock).toBeCloseTo(70);
    expect(sum(next)).toBeCloseTo(100);
  });

  test("valor acima de 100 é limitado a 100", () => {
    const next = redistributeAllocationTargets({ stock: 50, crypto: 50 }, "crypto", 150);
    expect(next.crypto).toBe(100);
  });

  test("valor negativo é limitado a 0", () => {
    const next = redistributeAllocationTargets({ stock: 50, crypto: 50 }, "crypto", -10);
    expect(next.crypto).toBe(0);
  });

  test("todas as classes presentes no resultado", () => {
    const next = redistributeAllocationTargets({ stock: 100 }, "crypto", 20);
    ALLOCATION_CLASSES.forEach((c) => expect(next).toHaveProperty(c));
  });
});

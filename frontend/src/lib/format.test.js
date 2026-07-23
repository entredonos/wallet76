import { convert, fmtPct, fmtCompact, curSymbol, fmtCurrency } from "./format";

describe("convert (USD -> moeda)", () => {
  test("USD é identidade", () => expect(convert(100, "USD", {})).toBe(100));
  test("EUR usa a taxa fornecida", () => expect(convert(100, "EUR", { EUR: 0.9 })).toBeCloseTo(90));
  test("EUR sem taxa usa fallback 0.92", () => expect(convert(100, "EUR", {})).toBeCloseTo(92));
  test("EUR aceita fxRates como número", () => expect(convert(100, "EUR", 0.8)).toBeCloseTo(80));
  test("CHF fallback 0.88", () => expect(convert(100, "CHF", {})).toBeCloseTo(88));
  test("BRL usa taxa fornecida", () => expect(convert(10, "BRL", { BRL: 5.5 })).toBeCloseTo(55));
  test("0 devolve 0 (não cai no guard de falsy)", () => expect(convert(0, "EUR", { EUR: 0.9 })).toBe(0));
  test("null devolve 0", () => expect(convert(null, "EUR", {})).toBe(0));
});

describe("fmtPct", () => {
  test("positivo leva sinal +", () => expect(fmtPct(3.456)).toBe("+3.46%"));
  test("negativo mantém -", () => expect(fmtPct(-2)).toBe("-2.00%"));
  test("zero sem sinal", () => expect(fmtPct(0)).toBe("0.00%"));
  test("casas decimais configuráveis", () => expect(fmtPct(1.2, 1)).toBe("+1.2%"));
});

describe("fmtCompact", () => {
  test("milhões", () => expect(fmtCompact(2_500_000, "USD")).toBe("$2.50M"));
  test("milhares", () => expect(fmtCompact(1500, "USD")).toBe("$1.50K"));
  test("abaixo de mil", () => expect(fmtCompact(42, "USD")).toBe("$42.00"));
  test("símbolo por moeda", () => expect(fmtCompact(1000, "EUR")).toBe("€1.00K"));
});

describe("curSymbol", () => {
  test("EUR", () => expect(curSymbol("EUR")).toBe("€"));
  test("BRL", () => expect(curSymbol("BRL")).toBe("R$"));
  test("default $", () => expect(curSymbol("USD")).toBe("$"));
});

describe("fmtCurrency", () => {
  test("formata em USD", () => expect(fmtCurrency(1234.5, "USD")).toBe("$1,234.50"));
  test("valor nulo -> $0.00", () => expect(fmtCurrency(null, "USD")).toBe("$0.00"));
});

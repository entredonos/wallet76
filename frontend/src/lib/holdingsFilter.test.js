import { filterHoldings, assetTypeSet } from "./holdingsFilter";

const H = [
  { symbol: "BTC", asset_type: "crypto", wallet_id: "w1" },
  { symbol: "ETH", asset_type: "crypto", wallet_id: "w2" },
  { symbol: "AAPL", asset_type: "stock", wallet_id: "w1" },
  { symbol: "VWCE", asset_type: "etf", wallet_id: "w2" },
  { symbol: "USDT", asset_type: "cash", wallet_id: "w1" },
];

describe("filterHoldings", () => {
  test("all/all devolve tudo", () => {
    expect(filterHoldings(H, "all", "all")).toHaveLength(5);
  });
  test("filtra por tipo", () => {
    const r = filterHoldings(H, "crypto", "all");
    expect(r.map((a) => a.symbol).sort()).toEqual(["BTC", "ETH"]);
  });
  test("filtra por carteira", () => {
    const r = filterHoldings(H, "all", "w1");
    expect(r.map((a) => a.symbol).sort()).toEqual(["AAPL", "BTC", "USDT"]);
  });
  test("filtra por tipo E carteira", () => {
    const r = filterHoldings(H, "crypto", "w1");
    expect(r.map((a) => a.symbol)).toEqual(["BTC"]);
  });
  test("tipo sem correspondência -> vazio", () => {
    expect(filterHoldings(H, "reit", "all")).toEqual([]);
  });
  test("defaults sem argumentos -> tudo", () => {
    expect(filterHoldings(H)).toHaveLength(5);
  });
  test("null/undefined -> []", () => {
    expect(filterHoldings(null)).toEqual([]);
    expect(filterHoldings(undefined)).toEqual([]);
  });
});

describe("assetTypeSet", () => {
  test("conjunto de tipos presentes", () => {
    const s = assetTypeSet(H);
    expect(s.has("crypto")).toBe(true);
    expect(s.has("stock")).toBe(true);
    expect(s.has("etf")).toBe(true);
    expect(s.has("cash")).toBe(true);
    expect(s.has("reit")).toBe(false);
    expect(s.size).toBe(4);
  });
  test("lista vazia/null -> conjunto vazio", () => {
    expect(assetTypeSet([]).size).toBe(0);
    expect(assetTypeSet(null).size).toBe(0);
  });
});

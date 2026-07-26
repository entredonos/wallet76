export function fmtCurrency(value, currency = "USD", opts = {}) {
  const num = Number(value || 0);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.min ?? 2,
    maximumFractionDigits: opts.max ?? 2,
  });
}

export function fmtPct(value, decimals = 2) {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(decimals)}%`;
}

export function fmtNum(value, decimals = 2) {
  const num = Number(value || 0);
  return num.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 2 });
}

export function fmtCompact(value, currency = "USD") {
  const num = Number(value || 0);
  const sym = currency === "EUR" ? "€" : currency === "CHF" ? "CHF " : currency === "BRL" ? "R$" : "$";
  if (Math.abs(num) >= 1_000_000) return `${sym}${(num/1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `${sym}${(num/1_000).toFixed(2)}K`;
  return `${sym}${num.toFixed(2)}`;
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
function toSubscript(n) {
  return String(n).split("").map((d) => SUBSCRIPTS[Number(d)] || d).join("");
}

// Quantidade compacta: 1.71M, 12.3k, 1,234, 0.1425…
export function fmtQty(value) {
  const n = Number(value || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.?0+$/, "") + "k";
  if (a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (a === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 }).replace(/\.?0+$/, "") || "0";
}

// Preço com casas adaptáveis; para valores minúsculos usa notação de
// subscrito estilo CoinGecko: $0.0₅812  (= $0.00000812).
export function fmtPriceSmart(value, currency = "USD") {
  const n = Number(value || 0);
  const a = Math.abs(n);
  if (a === 0) return fmtCurrency(0, currency);
  if (a >= 1) return fmtCurrency(n, currency);
  if (a >= 0.01) return fmtCurrency(n, currency, { max: 4 });
  const [mant, expPart] = a.toExponential().split("e");
  const exp = parseInt(expPart, 10);            // negativo
  const zeros = -exp - 1;                        // zeros à direita do ponto
  const digits = mant.replace(".", "").replace(/0+$/, "").slice(0, 4) || "0";
  const sign = n < 0 ? "-" : "";
  return `${sign}${curSymbol(currency)}0.0${toSubscript(zeros)}${digits}`;
}

export function convert(usdValue, currency, fxRates = {}) {
  if (!usdValue && usdValue !== 0) return 0;
  if (currency === "EUR") {
    const r = typeof fxRates === "number" ? fxRates : (fxRates?.EUR || 0.92);
    return usdValue * r;
  }
  if (currency === "CHF") {
    const r = fxRates?.CHF || 0.88;
    return usdValue * r;
  }
  if (currency === "BRL") {
    const r = fxRates?.BRL || 5.0;
    return usdValue * r;
  }
  return usdValue;
}

export function curSymbol(c) {
  return c === "EUR" ? "€" : c === "CHF" ? "CHF " : c === "BRL" ? "R$" : "$";
}

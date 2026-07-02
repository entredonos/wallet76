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

import { useState } from "react";

// ── Deterministic colour by symbol ────────────────────────────────────────────
const PALETTE = [
  "#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981",
  "#ef4444","#06b6d4","#f97316","#84cc16","#6366f1",
];
function hashColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// Module-level cache so failed URLs never retry across re-renders
const _failedUrls = new Set();

// Logo CDN helpers
function cryptoLogoUrl(sym) {
  return `https://cryptologos.cc/logos/${sym.toLowerCase()}-logo.svg?v=40`;
}
function fmpUrl(sym) {
  return `https://financialmodelingprep.com/image-stock/${sym.toUpperCase()}.png`;
}

// Fallback coloured initials avatar
function FallbackIcon({ symbol, size }) {
  const bg = hashColor(symbol);
  const initials = (symbol || "?").replace("-USD","").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-mono font-bold select-none"
      style={{
        width: size, height: size,
        background: bg + "28",
        border: `1.5px solid ${bg}55`,
        fontSize: Math.max(9, size * 0.33),
        color: bg,
      }}
    >
      {initials}
    </div>
  );
}

// Single-attempt image -- once a URL fails it never retries (no flicker)
function LogoImg({ src, fallback, symbol, size, rounded }) {
  const alreadyFailed = _failedUrls.has(src);
  const [failed, setFailed] = useState(alreadyFailed);

  if (failed || !src) {
    if (fallback && !_failedUrls.has(fallback)) {
      return <LogoImg src={fallback} fallback={null} symbol={symbol} size={size} rounded={rounded} />;
    }
    return <FallbackIcon symbol={symbol} size={size} />;
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`${rounded} shrink-0 object-contain`}
      style={{ width: size, height: size, background: "transparent" }}
      onError={() => { _failedUrls.add(src); setFailed(true); }}
    />
  );
}

/**
 * AssetIcon -- real logo, fallback to coloured initials.
 * Props: asset { symbol, asset_type, coingecko_id? }, size, logoUrl, rounded
 */
export default function AssetIcon({ asset, size = 28, logoUrl, rounded = "rounded-full" }) {
  if (!asset) return null;
  const sym = (asset.symbol || "").replace(/-USD$|-USDT$/, "").toUpperCase();
  const type = asset.asset_type || "stock";

  // Explicit URL override (e.g. from search backend)
  if (logoUrl && !_failedUrls.has(logoUrl)) {
    return <LogoImg src={logoUrl} symbol={sym} size={size} rounded={rounded} />;
  }

  if (type === "crypto") {
    const cgId = asset.coingecko_id;
    // Primary: CoinGecko URL if we have the id; fallback: CryptoLogos by symbol
    const primary = cgId
      ? `https://assets.coingecko.com/coins/images/1/small/${cgId}.png`
      : cryptoLogoUrl(sym);
    const fallback = cgId ? cryptoLogoUrl(sym) : null;
    return <LogoImg src={primary} fallback={fallback} symbol={sym} size={size} rounded={rounded} />;
  }

  // Stocks / ETFs -- Financial Modeling Prep
  return <LogoImg src={fmpUrl(sym)} symbol={sym} size={size} rounded={rounded} />;
}

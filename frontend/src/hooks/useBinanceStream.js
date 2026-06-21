import { useEffect, useRef, useState } from "react";

// Map common CoinGecko IDs to Binance USDT pair symbols
const SYMBOL_MAP = {
  bitcoin: "btcusdt",
  ethereum: "ethusdt",
  binancecoin: "bnbusdt",
  solana: "solusdt",
  cardano: "adausdt",
  ripple: "xrpusdt",
  dogecoin: "dogeusdt",
  polkadot: "dotusdt",
  litecoin: "ltcusdt",
  chainlink: "linkusdt",
  polygon: "maticusdt",
  "matic-network": "maticusdt",
  avalanche: "avaxusdt",
  "avalanche-2": "avaxusdt",
  uniswap: "uniusdt",
  cosmos: "atomusdt",
  stellar: "xlmusdt",
  tron: "trxusdt",
  "near-protocol": "nearusdt",
  arbitrum: "arbusdt",
  optimism: "opusdt",
  aptos: "aptusdt",
  sui: "suiusdt",
  toncoin: "tonusdt",
  "the-open-network": "tonusdt",
  shibainu: "shibusdt",
  "shiba-inu": "shibusdt",
  pepe: "pepeusdt",
  filecoin: "filusdt",
  vechain: "vetusdt",
  algorand: "algousdt",
  hedera: "hbarusdt",
  "hedera-hashgraph": "hbarusdt",
};

function toBinancePair(holding) {
  const cg = (holding.coingecko_id || "").toLowerCase();
  if (SYMBOL_MAP[cg]) return SYMBOL_MAP[cg];
  // Fallback: try symbol + usdt
  const sym = (holding.symbol || "").toLowerCase();
  if (!sym || sym === "usdt" || sym === "usdc" || sym === "busd") return null;
  return `${sym}usdt`;
}

/**
 * Connects to Binance WebSocket and streams live trade prices.
 * @param {Array} cryptoHoldings list of crypto holding objects (need symbol/coingecko_id)
 * @returns Map of { [coingecko_id|symbol_lower]: { price, ts } }
 */
export function useBinanceStream(cryptoHoldings) {
  const [prices, setPrices] = useState({});  // key = pair => { price, ts }
  const wsRef = useRef(null);
  const pairsKey = JSON.stringify(
    (cryptoHoldings || [])
      .map(toBinancePair)
      .filter(Boolean)
      .sort()
  );

  useEffect(() => {
    const pairs = JSON.parse(pairsKey);
    if (!pairs.length) return;

    // Combined stream URL — try primary then fallback
    const streams = pairs.map((p) => `${p}@miniTicker`).join("/");
    const endpoints = [
      `wss://stream.binance.com:9443/stream?streams=${streams}`,
      `wss://stream.binance.us:9443/stream?streams=${streams}`,
    ];

    let ws = null;
    let attempt = 0;
    let killed = false;
    let connectTimeout = null;

    const connect = () => {
      if (killed || attempt >= endpoints.length) return;
      const url = endpoints[attempt];
      attempt += 1;
      try {
        ws = new WebSocket(url);
        wsRef.current = ws;
      } catch (e) {
        connect();
        return;
      }
      connectTimeout = setTimeout(() => {
        if (ws && ws.readyState !== 1) {
          try { ws.close(); } catch {}
          connect();
        }
      }, 4000);

      ws.onopen = () => { if (connectTimeout) clearTimeout(connectTimeout); };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const data = msg.data || msg;
          if (!data || !data.s) return;
          const pair = data.s.toLowerCase();
          const price = parseFloat(data.c);
          if (!price) return;
          setPrices((prev) => {
            const p = prev[pair];
            if (p && p.price === price) return prev;
            return { ...prev, [pair]: { price, ts: Date.now() } };
          });
        } catch {}
      };

      ws.onerror = () => {
        if (connectTimeout) clearTimeout(connectTimeout);
        try { ws.close(); } catch {}
        connect();
      };
    };

    connect();

    return () => {
      killed = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      try { ws && ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [pairsKey]);

  // Build a result map keyed by coingecko_id and symbol so dashboard can lookup
  const byKey = {};
  (cryptoHoldings || []).forEach((h) => {
    const pair = toBinancePair(h);
    if (!pair) return;
    const live = prices[pair];
    if (!live) return;
    if (h.coingecko_id) byKey[h.coingecko_id.toLowerCase()] = live;
    if (h.symbol) byKey[h.symbol.toLowerCase()] = live;
  });

  return byKey;
}

import React from "react";
import {
  SiBitcoin, SiEthereum, SiBinance, SiSolana, SiCardano, SiDogecoin,
  SiTether, SiRipple, SiLitecoin, SiPolkadot,
} from "react-icons/si";
import { Coins, TrendingUp } from "lucide-react";

const CRYPTO_ICONS = {
  bitcoin: { Icon: SiBitcoin, color: "#f7931a" },
  btc: { Icon: SiBitcoin, color: "#f7931a" },
  ethereum: { Icon: SiEthereum, color: "#627eea" },
  eth: { Icon: SiEthereum, color: "#627eea" },
  binancecoin: { Icon: SiBinance, color: "#f3ba2f" },
  bnb: { Icon: SiBinance, color: "#f3ba2f" },
  solana: { Icon: SiSolana, color: "#9945ff" },
  sol: { Icon: SiSolana, color: "#9945ff" },
  cardano: { Icon: SiCardano, color: "#0033ad" },
  ada: { Icon: SiCardano, color: "#0033ad" },
  dogecoin: { Icon: SiDogecoin, color: "#c2a633" },
  doge: { Icon: SiDogecoin, color: "#c2a633" },
  tether: { Icon: SiTether, color: "#26a17b" },
  usdt: { Icon: SiTether, color: "#26a17b" },
  ripple: { Icon: SiRipple, color: "#23292f" },
  xrp: { Icon: SiRipple, color: "#ffffff" },
  litecoin: { Icon: SiLitecoin, color: "#a6a9aa" },
  ltc: { Icon: SiLitecoin, color: "#a6a9aa" },
  polkadot: { Icon: SiPolkadot, color: "#e6007a" },
  dot: { Icon: SiPolkadot, color: "#e6007a" },
};

export default function AssetIcon({ asset, size = 28 }) {
  const key = (asset.asset_type === "crypto"
    ? (asset.coingecko_id || asset.symbol)
    : asset.symbol
  )?.toLowerCase();

  if (asset.asset_type === "crypto") {
    const entry = CRYPTO_ICONS[key];
    if (entry) {
      const { Icon, color } = entry;
      return (
        <div
          className="rounded-full flex items-center justify-center border border-zinc-800"
          style={{ width: size, height: size, backgroundColor: "#18181b" }}
        >
          <Icon style={{ color, width: size * 0.6, height: size * 0.6 }} />
        </div>
      );
    }
    return (
      <div
        className="rounded-full flex items-center justify-center bg-zinc-800 border border-zinc-700 text-zinc-300"
        style={{ width: size, height: size }}
      >
        <Coins style={{ width: size * 0.55, height: size * 0.55 }} />
      </div>
    );
  }

  // Stock
  return (
    <div
      className="rounded-full flex items-center justify-center bg-zinc-100 text-zinc-950 font-mono font-semibold border border-zinc-800"
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {asset.symbol?.slice(0, 2).toUpperCase() || <TrendingUp className="w-3 h-3" />}
    </div>
  );
}

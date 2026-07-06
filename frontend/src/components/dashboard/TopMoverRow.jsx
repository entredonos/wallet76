import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import AssetIcon from "../AssetIcon";
import { fmtCurrency, fmtPct, convert } from "../../lib/format";
import { WALLET_DOT_CLASS, walletColorKey } from "../../lib/walletColors";

// Module-level (stable identity across renders) so React updates it in
// place instead of unmounting/remounting the whole row on every parent
// re-render (e.g. live-price polling). It used to be defined INSIDE the
// Dashboard render body, which gave React a brand-new component "type"
// every single render — forcing a full unmount+remount of every row,
// including AssetIcon's <img>, which read as a flicker/"refresh" effect,
// most noticeable while the mouse sat still over a row.
export default function TopMoverRow({ a, positive, wallets, nav, currency, fxRates, mask }) {
  const walletName = wallets.find((w) => w.id === a.wallet_id)?.name;
  const walletDot = WALLET_DOT_CLASS[walletColorKey(wallets, a.wallet_id)];
  return (
    <Link
      to={`/asset/${a.asset_type}/${a.symbol}`}
      className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors overflow-hidden"
      data-testid={`top-mover-${positive ? "up" : "down"}-${a.symbol}`}
    >
      <AssetIcon asset={a} size={24}/>
      {/* min-w-0 + flex-1 (em vez de shrink-0) — este bloco encolhe e
          trunca (símbolo/nome/valor) para a % à direita nunca ficar
          cortada (5 jul 2026). O widget passou a ocupar a largura toda em
          vez de 2 colunas lado a lado (6 jul 2026) precisamente para dar
          espaço a mostrar o nome do ativo aqui sem truncar logo a seguir
          ao símbolo. */}
      <div className="min-w-0 flex-1">
        {/* Nome do ativo a seguir ao símbolo (6 jul 2026: "temos que por o
            nome do ativo") — junto na mesma linha e truncado como um só
            bloco, para não empurrar o valor da 2ª linha nem roubar espaço
            à % à direita nos cards estreitos do grid de 2 colunas. */}
        <div className="font-mono text-zinc-100 text-sm leading-none truncate">
          {a.symbol}{a.name && a.name !== a.symbol ? <span className="text-zinc-400 font-normal"> · {a.name}</span> : ""}
        </div>
        <div className="text-[10px] font-mono text-zinc-400 leading-none mt-1 truncate">{mask(fmtCurrency(convert(a.value_usd, currency, fxRates), currency))}</div>
      </div>
      {/* Wallet badge — escondido em ecrãs estreitos (não há espaço para
          icon + símbolo/valor + badge + % sem cortar a %); volta a
          aparecer a partir de sm. */}
      {walletName && (
        // button (not Link) + stopPropagation: nesting a Link inside
        // the row's own Link would be invalid HTML and would just
        // trigger the outer navigation anyway.
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(`/dashboard?wallet=${a.wallet_id}`); }}
          className="hidden sm:inline-flex items-center max-w-[88px] shrink-0 truncate text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 bg-zinc-800/60 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          data-testid={`top-mover-wallet-${a.symbol}`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${walletDot}`} />
          <span className="truncate">{walletName}</span>
        </button>
      )}
      {/* Só a seta indica o sentido (subida/descida) — o sinal +/- do
          fmtPct ficava redundante ao lado da seta (6 jul 2026: "prefiro que
          deixes a seta e tires os sinais + e -"). Tirado só aqui, não em
          fmtPct em si — outros sítios da app mostram a % sem seta ao lado,
          onde o sinal continua a ser a única pista de direção. */}
      <div className={`font-mono text-sm shrink-0 whitespace-nowrap ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {positive ? <ArrowUpRight className="inline w-3 h-3"/> : <ArrowDownRight className="inline w-3 h-3"/>}
        {fmtPct(a.change_24h || 0).replace(/^[+-]/, "")}
      </div>
    </Link>
  );
}

import React, { useMemo, useState } from "react";
import AssetIcon from "./AssetIcon";
import { WALLET_DOT_CLASS, walletColorKey } from "../lib/walletColors";

// Painel "Distribuição do grupo" (Alocação, 29 jul 2026). Fica POR BAIXO da
// tabela: quem abre a página vem ver os números, e um gráfico entre o cabeçalho
// e a tabela empurrava a tabela para fora do ecrã.
//
// Cada ativo tem uma calha da largura toda, como a barra de um slider, e por
// cima o preenchimento na proporção do MAIOR do grupo (não de 100%, senão os
// pequenos ficam invisíveis). A calha é o que dá a escala: sem ela uma barra
// curta não se distingue de uma barra que não desenhou. O preenchimento vem
// partido pelas carteiras onde esse ativo está — assim a mesma barra responde
// às duas perguntas de uma vez: quanto pesa este ativo, e onde é que ele está.
//
// Duas decisões que não são óbvias:
//  1. Ordena sempre por valor decrescente, mesmo que a tabela em baixo esteja
//     ordenada por outra coisa. Um gráfico de barras por ordem alfabética é
//     ilegível — o objetivo aqui é ver a forma da distribuição, não procurar
//     uma linha.
//  2. As percentagens são DO GRUPO, não da carteira toda. A coluna "% Atual"
//     da tabela é do total; se aqui fosse igual, as barras da aba "Cripto"
//     somariam 62% e ninguém percebia porquê. O cabeçalho diz "% do grupo".
const TOP = 8;

// Largura minima da barra, em % da calha. Sem isto um ativo que valha 0,2% do
// grupo desenhava um fio de um pixel e nao se via la nada — e a pergunta que o
// painel responde ("onde e que este ativo esta") continua a fazer sentido para
// os pequenos. 6% e o ponto onde ainda cabem dois segmentos de carteira
// distinguiveis lado a lado.
const MIN_BAR = 6;

export default function GroupDistribution({ rows, wallets, title, L, money, walletName }) {
  const [all, setAll] = useState(false);
  const dot = (id) => WALLET_DOT_CLASS[walletColorKey(wallets, id)] || "bg-zinc-500";

  const { list, total, max, used } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => Number(b.value_usd || 0) - Number(a.value_usd || 0));
    const ids = [];
    sorted.forEach((r) => (r.wallets || []).forEach((w) => {
      if (!ids.includes(w.id)) ids.push(w.id);
    }));
    return {
      list: sorted,
      total: sorted.reduce((s, r) => s + Number(r.value_usd || 0), 0),
      max: sorted.length ? Number(sorted[0].value_usd || 0) : 0,
      used: ids,
    };
  }, [rows]);

  if (!list.length) return null;
  const shown = all ? list : list.slice(0, TOP);

  return (
    <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 sm:p-4 mt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-400">
          {title} <span className="text-zinc-600">· {L("alloc2.pct_of_group", "% do grupo")}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {used.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${dot(id)}`} />{walletName(id)}
            </span>
          ))}
        </div>
      </div>

      <div>
        {shown.map((r) => {
          const pct = total ? Number(r.value_usd || 0) / total * 100 : 0;
          const w = max ? Number(r.value_usd || 0) / max * 100 : 0;
          return (
            <div key={r.sym} className="flex items-center gap-2 sm:gap-3 py-1.5">
              <AssetIcon asset={r} size={18} />
              <div className="w-16 sm:w-32 shrink-0 text-[11px] text-zinc-300 truncate">
                {r.name || r.symbol}
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-4 rounded bg-zinc-800/50 overflow-hidden">
                  <div className="h-full rounded flex overflow-hidden"
                    style={{ width: `${Math.max(w, MIN_BAR)}%` }}>
                    {(r.wallets || []).map((wl, i) => (
                      <div key={i}
                        title={`${walletName(wl.id)} · ${money(wl.value_usd)}`}
                        className={dot(wl.id)}
                        style={{ width: `${r.value_usd ? Number(wl.value_usd || 0) / r.value_usd * 100 : 0}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="w-16 sm:w-24 shrink-0 text-right font-mono text-[11px] text-zinc-200">
                {money(r.value_usd)}
              </div>
              <div className="w-12 sm:w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
                {pct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {list.length > TOP && (
        <button onClick={() => setAll(!all)}
          className="mt-2 text-[10px] font-mono text-blue-400/80 hover:text-blue-300">
          {all ? L("alloc2.show_less", "Ver menos") : `${L("alloc2.show_all", "Ver todos")} (${list.length})`}
        </button>
      )}
    </div>
  );
}

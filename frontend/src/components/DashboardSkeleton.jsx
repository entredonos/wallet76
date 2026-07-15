import React from "react";
import walletLogo from "../assets/wallet76-logo.png";

// 14 jul 2026: substitui os antigos "bones" cinzentos (blocos com pulse a
// imitar a forma do dashboard) por um splash com o logo + barra de
// carregamento — mesmo visual do RouteFallback em App.js. Os blocos
// cinzentos apareciam sozinhos por baixo do cabeçalho/menu do Layout (que
// já monta antes disto), dando a sensação de a app estar "presa" em fundos
// cinzentos em vez de mostrar a marca enquanto os dados (portfolio/
// carteiras) ainda vêm do servidor — sobretudo notório na app nativa, onde
// o JS já vem todo empacotado (sem download de chunk), por isso o
// RouteFallback do Suspense nunca chega a aparecer e este era o único
// ecrã de espera que o utilizador via.
export default function DashboardSkeleton() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 fade-in">
      <img src={walletLogo} alt="Wallet76" className="w-14 h-14 object-contain opacity-90" />
      <div className="w-36 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full w-1/3 bg-blue-500 rounded-full loading-bar-sweep" />
      </div>
    </div>
  );
}

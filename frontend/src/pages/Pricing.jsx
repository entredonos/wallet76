import React from "react";
import { api } from "../lib/api";

export default function Pricing() {
  async function choosePlan(plan) {
    const res = await api.post(`/billing/create-checkout-session/${plan}`);
    window.location.href = res.data.url;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <h1 className="text-4xl font-bold text-center mb-4">
          Comece hoje com 30 dias grátis
        </h1>

        <p className="text-center text-zinc-400 mb-10">
          Cartão necessário para ativar o teste. Sem cobrança durante o período experimental.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-900">
            <h2 className="text-2xl font-bold mb-2">Plano Mensal</h2>
            <p className="text-4xl font-bold mb-6">6,99 € / mês</p>
            <button onClick={() => choosePlan("monthly")} className="w-full bg-white text-black rounded-xl py-3 font-bold">
              Começar teste grátis
            </button>
          </div>

          <div className="border border-zinc-700 rounded-2xl p-8 bg-zinc-900">
            <h2 className="text-2xl font-bold mb-2">Plano Anual</h2>
            <p className="text-4xl font-bold mb-6">59,99 € / ano</p>
            <button onClick={() => choosePlan("yearly")} className="w-full bg-emerald-400 text-black rounded-xl py-3 font-bold">
              Começar teste grátis
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-8">
          O cartão apenas será debitado após os 30 dias de teste gratuito, caso não cancele antes.
        </p>
      </div>
    </div>
  );
}
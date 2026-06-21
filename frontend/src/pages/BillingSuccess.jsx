import React from "react";
import { Link } from "react-router-dom";

export default function BillingSuccess() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">Subscrição ativada</h1>
        <p className="text-zinc-400 mb-6">
          O teste gratuito de 30 dias foi iniciado.
        </p>
        <Link to="/" className="bg-white text-black px-6 py-3 rounded-xl font-bold">
          Entrar na Wallet76
        </Link>
      </div>
    </div>
  );
}
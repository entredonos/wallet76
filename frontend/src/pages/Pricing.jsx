import React from "react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";

export default function Pricing() {
  const { t } = useI18n();

  async function choosePlan(plan) {
    const res = await api.post(`/billing/create-checkout-session/${plan}`);
    window.location.href = res.data.url;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <h1 className="text-4xl font-bold text-center mb-4">
          {t("pricing.title")}
        </h1>

        <p className="text-center text-zinc-400 mb-10">
          {t("pricing.subtitle")}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-900">
            <h2 className="text-2xl font-bold mb-2">{t("pricing.monthly")}</h2>
            <p className="text-4xl font-bold mb-6">{t("pricing.monthly_price")}</p>
            <button onClick={() => choosePlan("monthly")} className="w-full bg-white text-black rounded-xl py-3 font-bold">
              {t("pricing.cta")}
            </button>
          </div>

          <div className="border border-zinc-700 rounded-2xl p-8 bg-zinc-900">
            <h2 className="text-2xl font-bold mb-2">{t("pricing.yearly")}</h2>
            <p className="text-4xl font-bold mb-6">{t("pricing.yearly_price")}</p>
            <button onClick={() => choosePlan("yearly")} className="w-full bg-emerald-400 text-black rounded-xl py-3 font-bold">
              {t("pricing.cta")}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-8">
          {t("pricing.footer")}
        </p>
      </div>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

export default function BillingSuccess() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">{t("billing_success.title")}</h1>
        <p className="text-zinc-400 mb-6">
          {t("billing_success.subtitle")}
        </p>
        {/* 14 jul 2026 — era to="/", que numa sessão web normal (não nativa/
            standalone) mostra sempre a landing page pública (ver App.js,
            rota "/"), nunca o dashboard. Mesmo bug encontrado no
            OnboardingWizard.jsx nesta sessão. */}
        <Link to="/dashboard" className="bg-white text-black px-6 py-3 rounded-xl font-bold">
          {t("billing_success.cta")}
        </Link>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../context/I18nContext";
import { WifiOff } from "lucide-react";

// || "" — ver lib/api.js para o porquê (proxy same-origin em produção via
// vercel.json). Um caminho relativo ("/ping") é um alvo de fetch tão válido
// como um absoluto, por isso o guard "if (!BACKEND_URL) return" que existia
// aqui foi removido (ver useEffect abaixo) — com a env var vazia em
// produção, esse guard desativaria este banner por completo e silenciosamente.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const CHECK_INTERVAL_MS = 10000;
// 7 jul 2026: era 4000ms — bastava UMA resposta lenta (cold start do Render
// free/starter depois de ~15min sem tráfego, ou o event loop momentaneamente
// ocupado por um pedido pesado como /analytics) para este ping abortar e
// mostrar "Servidor indisponível" mesmo com o backend saudável, só lento.
// O utilizador reportou este banner "muitas vezes" — sintoma de falso
// positivo por timeout curto, não de instabilidade real. Subido para 10s
// (ainda bem abaixo dos ~18s que o resto da app já tolera num cold start).
const TIMEOUT_MS = 10000;
// Só mostra o banner ao FIM de 2 falhas seguidas (~10-20s de indisponibilidade
// real), não numa falha isolada — evita o "flap" de aparecer e desaparecer
// a cada 10s por causa de um único pedido lento.
const FAILURES_BEFORE_DOWN = 2;

// Pings the backend's lightweight /ping endpoint (mounted outside /api,
// see backend/server.py) on load and every CHECK_INTERVAL_MS afterwards.
// Shows a fixed top banner while the backend is unreachable, so users get
// an explicit "server is down" signal instead of a generic error only
// after they try to submit a form (e.g. login).
export default function BackendStatusBanner() {
  const { t } = useI18n();
  const [down, setDown] = useState(false);
  const timerRef = useRef(null);
  const failuresRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let ok = false;
      try {
        const res = await fetch(`${BACKEND_URL}/ping`, { signal: controller.signal });
        ok = res.ok;
      } catch {
        ok = false;
      } finally {
        clearTimeout(timeout);
      }
      if (cancelled) return;
      if (ok) {
        failuresRef.current = 0;
        setDown(false);
      } else {
        failuresRef.current += 1;
        if (failuresRef.current >= FAILURES_BEFORE_DOWN) setDown(true);
      }
    };

    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, []);

  if (!down) return null;

  return (
    <div
      role="alert"
      data-testid="backend-status-banner"
      className="fixed top-0 left-0 right-0 z-[100] bg-rose-950/95 border-b border-rose-800 text-rose-200 text-xs sm:text-sm font-mono py-2 px-4 flex items-center justify-center gap-2 backdrop-blur-sm"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{t("app.backend_unreachable")}</span>
    </div>
  );
}

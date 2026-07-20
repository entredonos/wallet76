import { useAuth } from "../context/AuthContext";

/**
 * Retorna informação sobre o plano do utilizador.
 * plan: "free" | "pro"
 * isPro: boolean
 * isFree: boolean
 * isAdmin: boolean
 *
 * Pré-visualização (só admins): ver a app como outro plano, SEM mexer na
 * conta. Lida APENAS do URL e NÃO persiste (20 jul 2026 — antes ficava
 * guardada e prendia o admin no modo grátis, inclusive na app Windows sem
 * barra de endereço). Acrescenta ?plan=free (ou ?plan=pro) ao endereço de
 * uma página; ao navegar/reabrir volta sozinho ao normal.
 * Só afeta o que é MOSTRADO; o backend aplica sempre os limites reais.
 */
export function usePlan() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const plan = user?.plan || "free";
  const sub = user?.subscription_status;
  let isPro = isAdmin || plan === "pro" || sub === "active" || sub === "trialing";
  let preview = null;

  try {
    if (isAdmin && typeof window !== "undefined") {
      // Limpa qualquer flag persistido de versões antigas (auto-desbloqueio).
      try { localStorage.removeItem("w76-preview-plan"); } catch { /* noop */ }
      const q = new URLSearchParams(window.location.search).get("plan");
      if (q === "free") { isPro = false; preview = "free"; }
      else if (q === "pro") { isPro = true; preview = "pro"; }
    }
  } catch { /* ignore */ }

  return {
    plan: isPro ? "pro" : "free",
    isPro,
    isFree: !isPro,
    isAdmin,
    previewPlan: preview, // "free" | "pro" | null — só definido em modo de pré-visualização admin
  };
}

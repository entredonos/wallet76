import { useAuth } from "../context/AuthContext";

/**
 * Retorna informação sobre o plano do utilizador.
 * plan: "free" | "pro"
 * isPro: boolean
 * isFree: boolean
 * isAdmin: boolean
 *
 * Pré-visualização (só admins): permite ver a app como se fosse de outro
 * plano, SEM mexer na conta. Ativa-se pelo URL e fica guardado até desligar:
 *   ?plan=free   → ver como plano Gratuito (limites + overlays de upgrade)
 *   ?plan=pro    → ver como Pro
 *   ?plan=reset  → voltar ao normal (a tua conta real)
 * Só afeta o que é MOSTRADO; o backend continua a aplicar os limites reais.
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
      const q = new URLSearchParams(window.location.search).get("plan");
      if (q === "free" || q === "pro") localStorage.setItem("w76-preview-plan", q);
      else if (q === "reset" || q === "off" || q === "real") localStorage.removeItem("w76-preview-plan");
      preview = localStorage.getItem("w76-preview-plan");
      if (preview === "free") isPro = false;
      else if (preview === "pro") isPro = true;
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

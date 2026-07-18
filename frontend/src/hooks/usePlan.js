import { useAuth } from "../context/AuthContext";

/**
 * Retorna informação sobre o plano do utilizador.
 * plan: "free" | "pro"
 * isPro: boolean
 * isFree: boolean
 * isAdmin: boolean
 */
export function usePlan() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const plan = user?.plan || "free";
  const sub = user?.subscription_status;
  const isPro = isAdmin || plan === "pro" || sub === "active" || sub === "trialing";
  return {
    plan: isPro ? "pro" : "free",
    isPro,
    isFree: !isPro,
    isAdmin,
  };
}

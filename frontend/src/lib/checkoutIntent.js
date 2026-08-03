// Intenção de compra que sobrevive ao registo (3 ago 2026).
//
// O buraco que isto tapa, visto duas vezes no teste do fundador do Jose:
// quem clica num plano SEM sessão vai registar-se, verifica o email, entra…
// e aterra no painel — o checkout que ele próprio pediu fica esquecido.
// Solução: no clique guarda-se aqui a intenção; no primeiro login o Layout
// vê-a e leva a pessoa ao /pricing, que a consome e abre logo o Stripe.
//
// TTL de 48 h: cobre quem regista à noite e verifica o email no dia
// seguinte, mas não persegue semanas depois quem entretanto mudou de ideias.
// Tudo best-effort: localStorage bloqueado (Safari privado, etc.) nunca
// pode partir o clique — no pior caso volta o comportamento antigo.

const KEY = "w76-checkout-intent";
const TTL_MS = 48 * 60 * 60 * 1000;

export function saveCheckoutIntent({ plan, founder = false, cur = "eur" }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ plan, founder, cur, ts: Date.now() }));
  } catch (_e) { /* sem storage, sem memória — o fluxo antigo continua a valer */ }
}

export function readCheckoutIntent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.ts || Date.now() - d.ts > TTL_MS) {
      clearCheckoutIntent();
      return null;
    }
    if (d.plan !== "monthly" && d.plan !== "yearly") return null;
    return d;
  } catch (_e) {
    return null;
  }
}

export function clearCheckoutIntent() {
  try {
    localStorage.removeItem(KEY);
  } catch (_e) { /* nada a fazer */ }
}

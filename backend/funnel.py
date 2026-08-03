"""Funil de eventos (3 ago 2026) — coleção `events`, append-only.

O desenho aprovado (Wallet76_NEGOCIO.md, P1) tem três andares: o topo
anónimo fica no Cloudflare Web Analytics (fora do código), o dinheiro fino
fica no painel do Stripe, e ESTE módulo é o andar do meio — o funil
identificado, em casa: quem se registou, verificou o email, meteu o
primeiro ativo, iniciou checkout, entrou em trial, pagou, cancelou.

Regras do desenho, para não crescer para um BI:
- A coleção é SÓ de escrita (append-only). Nada edita nem apaga eventos;
  quem lê é o GET /admin/funnel (routes/feedback.py), que só conta.
- Um evento nunca pode partir o pedido que o regista: registar um evento
  falhado vale menos do que um registo falhado. Por isso o log_event
  engole qualquer exceção e limita-se a deixar aviso no log.
- Datas como string ISO 8601 (como todos os timestamps do projeto):
  comparam-se lexicograficamente, que é o que o funil usa no $gte.

Índices (server.py, _ensure_indexes): (user_id, event) para o `once` e
(event, at) para as contagens por janela.
"""
from datetime import datetime, timezone

from core import db, logger

# Os degraus do funil, pela ordem em que um utilizador os atravessa.
# O admin_funnel (routes/feedback.py) conta utilizadores distintos por
# degrau e calcula a % de conversão entre degraus consecutivos; o
# "cancelled" é o 7.º número — churn, não conversão.
FUNNEL_STEPS = [
    "registered",           # POST /auth/register
    "email_verified",       # POST /auth/verify-email
    "first_asset",          # 1.ª transação (manual ou import) — once=True
    "checkout_started",     # checkout Stripe criado (normal ou fundador)
    "trial_started",        # webhook: subscrição entrou em "trialing"
    "subscription_active",  # webhook: transição para "active" (1.º pagamento)
    "cancelled",            # webhook: customer.subscription.deleted
]


async def log_event(user_id: str, event: str, meta: dict | None = None, once: bool = False):
    """Regista um evento do funil. Nunca levanta exceção.

    once=True: só grava se este utilizador ainda não tiver um evento com
    este nome — para degraus que só fazem sentido uma vez (first_asset).
    A verificação find_one + insert não é atómica, mas uma duplicação
    rara é inofensiva: o funil conta utilizadores DISTINTOS por degrau.
    """
    try:
        if once and await db.events.find_one(
            {"user_id": user_id, "event": event}, {"_id": 1}
        ):
            return
        await db.events.insert_one({
            "user_id": user_id,
            "event": event,
            "meta": meta or {},
            "at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"[funnel] falha a registar '{event}' ({user_id}): {e}")

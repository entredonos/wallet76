"""Programa de referral: código de convite, cálculo de recompensas e
aplicação via crédito de saldo Stripe (ver conversa com o utilizador,
14 jul 2026).

Modelo acordado:
- Amigo referido: trial estendido de 30 para 45 dias (30 padrão + 15 dias
  de bónus por ter usado um código) — aplicado em routes/billing.py na
  criação do checkout session.
- Referrer: por cada convite VÁLIDO (o amigo referido pagou a primeira
  fatura — nunca no registo, para não poder ser gamed com contas que nunca
  chegam a pagar), ganha +15 dias grátis, sem limite, SOMADOS ao bónus do
  marco mais alto atingido (2 meses aos 3 convites, 6 meses aos 6, 12 meses
  aos 10 — os marcos não se somam entre si, só o mais alto conta).
- "Válido" é decidido no webhook do Stripe (routes/billing.py), quando a
  subscrição do amigo referido transita de "trialing" para "active" pela
  primeira vez.
- A recompensa do referrer é sempre aplicada como crédito de saldo Stripe
  (`Customer.create_balance_transaction`), independentemente do estado da
  subscrição dele (trial, pago ou nenhuma ainda) — o saldo fica só à espera
  e aplica-se automaticamente à próxima fatura que for gerada, o que evita
  ter de tratar trial/pago/nenhum como três casos diferentes.
"""
import os
import secrets
import string
import uuid
from datetime import datetime, timezone

import stripe

from core import db, cache_get, cache_set, logger

_CODE_ALPHABET = string.ascii_uppercase + string.digits
_CODE_LEN = 8

PRICE_MONTHLY = os.environ.get("STRIPE_PRICE_MONTHLY")
PRICE_YEARLY = os.environ.get("STRIPE_PRICE_YEARLY")


async def get_or_create_referral_code(user: dict) -> str:
    existing = user.get("referral_code")
    if existing:
        return existing
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LEN))
        clash = await db.users.find_one({"referral_code": code}, {"_id": 1})
        if not clash:
            await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
            return code
    # Praticamente impossível (colisão 10x seguidas num alfabeto de 36^8),
    # mas nunca deixar o pedido falhar por causa disto.
    code = uuid.uuid4().hex[:8].upper()
    await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
    return code


def milestone_days(valid_count: int) -> int:
    """Bónus do marco mais alto atingido, em dias (2/6/12 meses de 30 dias
    aos 3/6/10 convites válidos) — os marcos não se somam entre si."""
    if valid_count >= 10:
        return 12 * 30
    if valid_count >= 6:
        return 6 * 30
    if valid_count >= 3:
        return 2 * 30
    return 0


def total_reward_days(valid_count: int) -> int:
    """Total de dias grátis a que o referrer tem direito: bónus do marco +
    15 dias por cada convite válido, sem limite."""
    return milestone_days(valid_count) + valid_count * 15


def _price_daily_info(plan: str):
    """(cêntimos/dia, moeda) do plano indicado, com cache de 6h — evita ir
    ao Stripe a cada recompensa aplicada, já que o preço quase nunca muda."""
    price_id = PRICE_YEARLY if plan == "yearly" else PRICE_MONTHLY
    if not price_id:
        return 0, "usd"
    cache_key = f"stripe_price_info:{price_id}"
    cached = cache_get(cache_key, ttl=21600)
    if cached is not None:
        amount, currency, days_in_period = cached
    else:
        amount, currency = 0, "usd"
        try:
            price = stripe.Price.retrieve(price_id)
            amount = price["unit_amount"] or 0
            currency = price["currency"] or "usd"
        except Exception as e:
            logger.error(f"referral_utils: falha ao obter preço Stripe {price_id}: {e}")
        days_in_period = 365 if plan == "yearly" else 30
        cache_set(cache_key, (amount, currency, days_in_period))
    daily_cents = round(amount / days_in_period) if days_in_period > 0 else 0
    return daily_cents, currency


async def grant_referrer_reward_if_needed(referrer_id: str) -> None:
    """Recalcula o total de dias a que o referrer tem direito agora (marco +
    15 dias × convites válidos) e aplica só a DIFERENÇA face ao que já lhe
    foi concedido antes — chamado sempre que um convite passa a válido, para
    nunca conceder o mesmo dia duas vezes."""
    referrer = await db.users.find_one({"id": referrer_id})
    if not referrer:
        return

    valid_count = await db.referrals.count_documents({"referrer_id": referrer_id, "status": "valid"})
    target_days = total_reward_days(valid_count)
    already_granted = referrer.get("referral_reward_days_granted", 0)
    delta_days = target_days - already_granted
    if delta_days <= 0:
        return

    plan = referrer.get("subscription_plan") or "monthly"
    daily_cents, currency = _price_daily_info(plan)
    credit_cents = delta_days * daily_cents

    customer_id = referrer.get("stripe_customer_id")
    if not customer_id:
        try:
            customer = stripe.Customer.create(email=referrer["email"], metadata={"user_id": referrer_id})
            customer_id = customer.id
            await db.users.update_one({"id": referrer_id}, {"$set": {"stripe_customer_id": customer_id}})
        except Exception as e:
            logger.error(f"referral: falha ao criar cliente Stripe para referrer {referrer_id}: {e}")
            return

    if credit_cents > 0:
        try:
            stripe.Customer.create_balance_transaction(
                customer_id,
                amount=-credit_cents,
                currency=currency,
                description=f"Wallet76 referral reward: {delta_days} dias grátis ({valid_count} convites válidos)",
            )
        except Exception as e:
            logger.error(f"referral: falha ao aplicar crédito de saldo para referrer {referrer_id}: {e}")
            return

    await db.users.update_one(
        {"id": referrer_id},
        {"$set": {
            "referral_reward_days_granted": target_days,
            "referral_reward_days_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

"""Programa de referral — endpoint para o utilizador ver o seu código,
link de convite e estatísticas (ver referral_utils.py para a lógica de
cálculo e aplicação das recompensas)."""
from fastapi import APIRouter, Depends

from core import db, get_current_user, APP_URL
from referral_utils import get_or_create_referral_code

router = APIRouter()


@router.get("/referrals/me")
async def my_referrals(user=Depends(get_current_user)):
    code = await get_or_create_referral_code(user)

    valid_count = await db.referrals.count_documents({"referrer_id": user["id"], "status": "valid"})
    pending_count = await db.referrals.count_documents({"referrer_id": user["id"], "status": "pending"})

    if valid_count < 3:
        next_milestone, remaining = 3, 3 - valid_count
    elif valid_count < 6:
        next_milestone, remaining = 6, 6 - valid_count
    elif valid_count < 10:
        next_milestone, remaining = 10, 10 - valid_count
    else:
        next_milestone, remaining = None, 0

    base = APP_URL.rstrip("/") if APP_URL else ""
    invite_link = f"{base}/register?ref={code}"

    return {
        "code": code,
        "invite_link": invite_link,
        "valid_referrals": valid_count,
        "pending_referrals": pending_count,
        "reward_days_granted": user.get("referral_reward_days_granted", 0),
        "next_milestone": next_milestone,
        "referrals_until_next_milestone": remaining,
    }

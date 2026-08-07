"""Feedback endpoint — ratings, questions, ideas, bugs + admin user management."""
import re
from datetime import datetime, timezone, timedelta

from core import (
    db, get_current_user, require_admin, delete_all_user_data, logger,
    cache_stats, PROCESS_STARTED, check_rate_limit,
)
from funnel import FUNNEL_STEPS, ANON_STEPS, log_anon_event
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

router = APIRouter()


@router.get("/admin/health")
async def admin_health(user=Depends(require_admin)):
    """Admin only — saúde do PROCESSO: memória real (RSS/pico, lidos do
    /proc), uptime, radiografia da cache por prefixo e tamanho da base de
    dados (dbStats). Criado a 31 jul 2026 por causa dos OOMs no Render
    (512 MB): o gráfico do painel diz QUANTO se gasta; isto diz EM QUÊ.
    Nota: por-worker, como o /admin/data-health."""
    from datetime import datetime, timezone
    import os as _os
    mem = {}
    threads = None
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith(("VmRSS", "VmHWM")):
                    k, v = line.split(":", 1)
                    mem[k.strip().lower()] = round(int(v.strip().split()[0]) / 1024.0, 1)
                elif line.startswith("Threads"):
                    threads = int(line.split(":", 1)[1].strip())
    except OSError:
        mem = {"vmrss": None, "vmhwm": None}
    # fds e threads distinguem teorias de fuga: fds a subir sem parar =
    # sockets/sessões por fechar; fds estáveis com RSS a subir = alocador
    # (fragmentação das arenas do glibc com pandas em threads).
    try:
        open_fds = len(_os.listdir("/proc/self/fd"))
    except OSError:
        open_fds = None
    stats = await db.command("dbStats")
    up = (datetime.now(timezone.utc) - PROCESS_STARTED).total_seconds()
    return {
        "memory_mb": mem,
        "threads": threads,
        "open_fds": open_fds,
        "uptime_h": round(up / 3600.0, 2),
        "cache": cache_stats(),
        "db": {
            "data_mb": round(stats.get("dataSize", 0) / 1048576.0, 1),
            "storage_mb": round(stats.get("storageSize", 0) / 1048576.0, 1),
            "objects": stats.get("objects"),
        },
    }


@router.get("/admin/data-health")
async def admin_data_health(user=Depends(require_admin)):
    """Admin only — snapshot da qualidade dos dados: valores rejeitados
    recentes (preços/câmbios), frescura do câmbio e nº de preços em cache.
    Serve para vigiar a fiabilidade das fontes, sobretudo no arranque.
    Nota: o cache é por-worker, por isso o snapshot reflete um worker; o
    sinal durável para alertas são os logs '[data-health]' no Render."""
    from prices import get_data_health  # lazy: evita import circular
    return get_data_health()

class AnonEventIn(BaseModel):
    event: str


@router.post("/events/anon")
async def track_anon_event(body: AnonEventIn, request: Request):
    """PÚBLICO, sem autenticação — o topo do funil vem de quem ainda não tem
    conta (5 ago 2026). Regista só os dois eventos da lista branca e nada mais:
    sem id de visitante, sem cookie, sem IP guardado.

    Duas guardas, porque uma porta aberta que escreve na base de dados é um
    convite: a lista branca (ANON_STEPS) impede que se encham a coleção de
    eventos inventados, e o rate limit por IP trava quem tente. 60/hora é muito
    acima de um visitante real (que gera 1 ou 2) e muito abaixo do que faria
    mossa nos 512 MB do Atlas.
    """
    check_rate_limit(request, "anon-event", max_attempts=60, window_seconds=3600)
    if body.event not in ANON_STEPS:
        raise HTTPException(400, "Unknown event")
    await log_anon_event(body.event)
    return {"ok": True}


@router.get("/admin/funnel")
async def admin_funnel(
    days: int = Query(30, ge=1, le=365),
    user=Depends(require_admin),
):
    """Admin only — o funil de conversão (3 ago 2026; desenho no NEGOCIO,
    P1). Conta utilizadores DISTINTOS por degrau na janela pedida e a % de
    conversão face ao degrau anterior. São os 7 números combinados — isto
    não é um BI: o topo anónimo vive no Cloudflare Web Analytics e o
    dinheiro fino no painel do Stripe.

    O 7.º degrau ("cancelled") não é conversão, é churn: a sua % é
    calculada face ao subscription_active, e não entra na cadeia (um
    cancelamento não é o degrau seguinte de uma subscrição no funil de
    aquisição)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    steps = []
    prev_n = None
    for ev in FUNNEL_STEPS:
        if ev in ANON_STEPS:
            # Anónimos não têm user_id: contam-se EVENTOS (o browser já evitou
            # repetir na mesma sessão). São "visitas", não "visitantes únicos",
            # e o rótulo no admin diz isso.
            n = await db.events.count_documents({"event": ev, "at": {"$gte": cutoff}})
        else:
            uids = await db.events.distinct("user_id", {"event": ev, "at": {"$gte": cutoff}})
            n = len(uids)
        pct = round(n / prev_n * 100.0, 1) if prev_n else None
        steps.append({"event": ev, "users": n, "pct_of_prev": pct, "anon": ev in ANON_STEPS})
        if ev != "cancelled":
            prev_n = n
    return {"days": days, "since": cutoff, "steps": steps}


# Safe projection for admin user listings — never pull password_hash or
# reset/verify token hashes into Python just to discard them in _safe_user.
_USER_LIST_PROJECTION = {
    "_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1,
    "email_verified": 1, "subscription_plan": 1, "subscription_status": 1,
    "last_active_at": 1,
}


async def _enrich_users(docs: list[dict]) -> list[dict]:
    """Junta a cada utilizador o nº de ativos e as corretoras ligadas
    (lista enriquecida do admin, 3 ago 2026 — desenho no NEGOCIO, P1).

    "Nº de ativos" = símbolos distintos com transações — deliberadamente
    uma aproximação: calcular holdings reais (compute_holdings_from_txns)
    para cada utilizador da lista custaria carregar as transações todas
    de toda a gente; contar símbolos é uma aggregation no Mongo e chega
    para a pergunta do admin ("esta conta está vazia ou a sério?")."""
    ids = [u.get("id") for u in docs if u.get("id")]
    safe = [_safe_user(u) for u in docs]
    if not ids:
        return safe
    try:
        rows = await db.transactions.aggregate([
            {"$match": {"user_id": {"$in": ids}}},
            {"$group": {"_id": {"u": "$user_id", "s": "$symbol"}}},
            {"$group": {"_id": "$_id.u", "n": {"$sum": 1}}},
        ]).to_list(len(ids) + 10)
        assets = {r["_id"]: r["n"] for r in rows}
        rows = await db.broker_connections.aggregate([
            {"$match": {"user_id": {"$in": ids}}},
            {"$group": {"_id": "$user_id", "brokers": {"$addToSet": "$broker"}}},
        ]).to_list(len(ids) + 10)
        brokers = {r["_id"]: sorted(r["brokers"]) for r in rows}
    except Exception as e:
        logger.warning(f"admin: enriquecimento da lista falhou ({e}) — lista simples")
        return safe
    for u, s in zip(docs, safe):
        s["assets_count"] = assets.get(u.get("id"), 0)
        s["brokers"] = brokers.get(u.get("id"), [])
    return safe


def _tier_filter(tier: str) -> dict:
    """Server-side Mongo filter matching the same tier logic as _safe_user's
    `tier` field, so admin_user_list can filter in the DB instead of pulling
    every user into Python first."""
    if tier == "monthly":
        return {"subscription_status": "active", "subscription_plan": "monthly"}
    if tier == "yearly":
        return {"subscription_status": "active", "subscription_plan": "yearly"}
    if tier == "free":
        return {"$nor": [{"subscription_status": "active", "subscription_plan": {"$in": ["monthly", "yearly"]}}]}
    return {}


class FeedbackIn(BaseModel):
    category: str     # "rating" | "question" | "idea" | "bug"
    rating: int | None = None   # 1-5, only for category="rating"
    message: str


@router.post("/feedback")
async def submit_feedback(body: FeedbackIn, user=Depends(get_current_user)):
    doc = {
        "user_id":    user["id"],
        "user_email": user.get("email", ""),
        "category":   body.category,
        "rating":     body.rating,
        "message":    body.message.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read":       False,
    }
    await db.feedback.insert_one(doc)
    logger.info(f"Feedback [{body.category}] from {user.get('email')}: {body.message[:60]}")
    return {"ok": True}


@router.get("/feedback/unread-count")
async def unread_count(user=Depends(require_admin)):
    """Admin only -- count of unread feedback messages."""
    count = await db.feedback.count_documents({"read": {"$ne": True}})
    return {"count": count}


@router.patch("/feedback/mark-all-read")
async def mark_all_read(user=Depends(require_admin)):
    """Admin only -- mark all feedback as read."""
    await db.feedback.update_many({"read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@router.get("/feedback")
async def list_feedback(user=Depends(require_admin)):
    """Admin only -- returns all feedback."""
    docs = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


# -- Admin: User Management ----------------------------------------------------

def _safe_user(u: dict) -> dict:
    """Strip sensitive fields before sending to admin UI."""
    sub_plan   = u.get("subscription_plan")
    sub_status = u.get("subscription_status", "none")
    if sub_status == "active" and sub_plan:
        tier = sub_plan  # "monthly" or "yearly"
    else:
        tier = "free"
    return {
        "id":             u.get("id", ""),
        "email":          u.get("email", ""),
        "name":           u.get("name", ""),
        "tier":           tier,
        "created_at":     u.get("created_at", ""),
        "email_verified": u.get("email_verified", False),
        "last_active_at": u.get("last_active_at", ""),
        # 3 ago 2026 — o tier resume "quem paga"; o status conta o resto da
        # história (trialing, past_due, canceled) e o admin quer vê-la.
        "subscription_status": sub_status,
    }


@router.get("/admin/users/stats")
async def admin_user_stats(user=Depends(require_admin)):
    """Admin only -- user counts + last 10 registrations. Counts come from a
    Mongo aggregation ($group) instead of loading every user document into
    Python, so this stays fast as the user base grows."""
    pipeline = [
        {"$group": {
            "_id": {
                "$cond": [
                    {"$and": [
                        {"$eq": ["$subscription_status", "active"]},
                        {"$in": ["$subscription_plan", ["monthly", "yearly"]]},
                    ]},
                    "$subscription_plan",
                    "free",
                ]
            },
            "count": {"$sum": 1},
        }},
    ]
    rows = await db.users.aggregate(pipeline).to_list(10)
    counts = {r["_id"]: r["count"] for r in rows}
    free, monthly, yearly = counts.get("free", 0), counts.get("monthly", 0), counts.get("yearly", 0)

    last10_docs = await db.users.find({}, _USER_LIST_PROJECTION).sort("created_at", -1).to_list(10)
    last10 = await _enrich_users(last10_docs)

    # Ativos nas últimas 24h — last_active_at é uma string ISO 8601, que
    # ordena/compara lexicograficamente igual a cronologicamente (mesmo
    # truque já usado em admin_users_unread_count para created_at), por
    # isso dá para comparar diretamente com $gte sem parsear datas no Mongo.
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    active_24h = await db.users.count_documents({"last_active_at": {"$gte": cutoff_24h}})

    # "Online agora" (7 jul 2026) — mesmo campo, janela de 5 min em vez de
    # 24h: coincide com o throttle de escrita do last_active_at (core.py
    # get_current_user), a mesma janela já usada em describeActivity() no
    # frontend para o ponto verde "Online agora" por utilizador. Não é um
    # heartbeat em tempo real, é "fez um pedido autenticado nos últimos 5
    # min" — mesma aproximação, só que agregada; sai grátis da mesma query.
    cutoff_5m = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    active_now = await db.users.count_documents({"last_active_at": {"$gte": cutoff_5m}})

    return {
        "total":   free + monthly + yearly,
        "free":    free,
        "monthly": monthly,
        "yearly":  yearly,
        "active_24h": active_24h,
        "active_now": active_now,
        "last10":  last10,
    }


@router.get("/admin/users/list")
async def admin_user_list(
    tier: str | None = Query(None, description="free|monthly|yearly; omit for all users"),
    user=Depends(require_admin),
):
    """Admin only -- full user list, optionally filtered by tier. Backs the
    clickable stat cards (Total/Free/Pro Mensal/Pro Anual) on the admin
    Users tab, as opposed to /admin/users/stats' last10 which is always
    unfiltered and capped at 10. The tier filter is applied in the Mongo
    query itself (see _tier_filter) rather than after loading every user."""
    query = _tier_filter(tier) if tier in ("free", "monthly", "yearly") else {}
    docs = await db.users.find(query, _USER_LIST_PROJECTION).sort("created_at", -1).to_list(10000)
    return await _enrich_users(docs)


@router.get("/admin/users/search")
async def admin_user_search(
    q: str = Query(..., min_length=1),
    user=Depends(require_admin),
):
    """Admin only -- search users by email or name (case-insensitive)."""
    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
    results = await db.users.find(
        {"$or": [{"email": pattern}, {"name": pattern}]},
        _USER_LIST_PROJECTION,
    ).sort("created_at", -1).to_list(50)

    return await _enrich_users(results)


@router.get("/admin/users/unread-count")
async def admin_users_unread_count(user=Depends(require_admin)):
    """Admin only -- count of users registered since the admin last viewed
    the Utilizadores tab. Unlike feedback (which has a per-document `read`
    flag), users aren't individually markable, so we track a single
    "last seen" timestamp in admin_state instead and count new signups
    after it. First call ever baselines to "now" so existing users don't
    all show up as "new" at once."""
    state = await db.admin_state.find_one({"_id": "singleton"})
    last_seen = state.get("users_last_seen_at") if state else None
    if not last_seen:
        await db.admin_state.update_one(
            {"_id": "singleton"},
            {"$set": {"users_last_seen_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return {"count": 0}
    count = await db.users.count_documents({"created_at": {"$gt": last_seen}})
    return {"count": count}


@router.patch("/admin/users/mark-seen")
async def admin_users_mark_seen(user=Depends(require_admin)):
    """Admin only -- resets the new-users badge by bumping the last-seen
    timestamp to now."""
    await db.admin_state.update_one(
        {"_id": "singleton"},
        {"$set": {"users_last_seen_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(require_admin)):
    """Admin only -- permanently delete a user and all their data."""
    from core import ADMIN_EMAILS

    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("email") in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Cannot delete admin account")

    email = target.get("email", "")
    await delete_all_user_data(user_id)

    logger.warning(f"Admin deleted user {email} (id={user_id})")
    return {"ok": True, "deleted_email": email}

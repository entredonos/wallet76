"""Relatório agendado de saúde do backend (2 ago 2026).

O que é: de X em X dias (env HEALTH_REPORT_DAYS, omissão 7 = semanal), envia
por email aos ADMIN_EMAILS um retrato do processo — RSS/pico, threads, fds,
cache por prefixo, tamanho do Mongo e uptime. É a versão "vem ter comigo" do
GET /api/admin/health, pedida pelo Jose a 30 jul e construída depois de o P0
da memória fechar (1 ago), já com dados reais para saber o que vale a pena
mostrar.

Porquê email e não Telegram (para já): o circuito de email (Resend) está
verificado e é o mesmo dos alertas de dados; o Telegram do bot está preso aos
chat_ids dos utilizadores e precisaria de um chat de admin próprio — fica
como melhoria quando fizer falta.

Duas decisões de desenho:
1. O "quando enviei" vive no Mongo (coleção `meta`), não em memória — um
   deploy reinicia o processo mas não pode reiniciar a cadência, senão a
   contagem voltava a zero a cada push e o relatório semanal nunca chegava
   (ou chegava a cada deploy).
2. Sem `last` gravado (primeira vez), envia logo no arranque seguinte — o
   Jose recebe um exemplar imediato para ver a cara do relatório, e a
   cadência conta a partir daí.
"""
import asyncio
import os
from datetime import datetime, timezone

from core import db, logger, cache_stats, PROCESS_STARTED, ADMIN_EMAILS
from email_utils import send_email, email_layout

REPORT_DAYS = float(os.environ.get("HEALTH_REPORT_DAYS", "7") or "0")
_CHECK_EVERY = 3600  # verifica de hora a hora se o intervalo já passou


def _proc_stats() -> dict:
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
        pass
    try:
        fds = len(os.listdir("/proc/self/fd"))
    except OSError:
        fds = None
    return {"mem": mem, "threads": threads, "fds": fds}


async def _build_report():
    """Devolve (assunto, html). Texto em PT: o destinatário é o dono."""
    p = _proc_stats()
    c = cache_stats()
    try:
        stats = await db.command("dbStats")
    except Exception:
        stats = {}
    up_h = (datetime.now(timezone.utc) - PROCESS_STARTED).total_seconds() / 3600.0
    rss = p["mem"].get("vmrss") or 0
    hwm = p["mem"].get("vmhwm") or 0
    data_mb = round(stats.get("dataSize", 0) / 1048576.0, 1)
    sto_mb = round(stats.get("storageSize", 0) / 1048576.0, 1)
    ok = rss < 450
    verdict = "✅ tudo em ordem" if ok else "⚠️ RSS perto do limite de 512 MB"
    top_rows = "".join(
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>{p}</td>"
        "<td align='right' style='padding:3px 12px 3px 0'>{e}</td>"
        "<td align='right'>{m} MB</td></tr>".format(p=t["prefix"], e=t["entries"], m=t["approx_mb"])
        for t in c.get("top_prefixes", [])[:5]
    ) or "<tr><td colspan='3' style='color:#52525b'>cache vazia</td></tr>"

    body = (
        "<p style='margin:0 0 14px'><b>{verdict}</b></p>"
        "<table style='font-size:14px; border-collapse:collapse'>"
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>Memória (RSS)</td><td><b>{rss} MB</b> (pico {hwm} MB, limite 512)</td></tr>"
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>Uptime</td><td>{up:.1f} h desde o último arranque</td></tr>"
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>Threads / fds</td><td>{th} / {fds}</td></tr>"
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>Cache</td><td>{cmb} MB de {bud} MB ({ent} entradas)</td></tr>"
        "<tr><td style='padding:3px 12px 3px 0; color:#52525b'>MongoDB</td><td>{dmb} MB de dados ({smb} MB em disco, {obj} objetos) — limite M0: 512 MB</td></tr>"
        "</table>"
        "<p style='margin:16px 0 6px; font-size:13px; color:#52525b'><b>Cache por prefixo (top 5):</b></p>"
        "<table style='font-size:13px; border-collapse:collapse'>{top}</table>"
        "<p style='margin:18px 0 0; font-size:12px; color:#71717a'>Intervalo: {days:g} dia(s) — muda com a env HEALTH_REPORT_DAYS no Render (0 desliga). Detalhe ao vivo: GET /api/admin/health.</p>"
    ).format(verdict=verdict, rss=rss, hwm=hwm, up=up_h, th=p["threads"], fds=p["fds"],
             cmb=c.get("approx_mb"), bud=c.get("budget_mb"), ent=c.get("entries"),
             dmb=data_mb, smb=sto_mb, obj=stats.get("objects", "?"), top=top_rows,
             days=REPORT_DAYS)
    subject = "Wallet76 · saúde do backend — RSS {rss} MB, uptime {up:.0f} h".format(rss=rss, up=up_h)
    html = email_layout("Saúde do backend", body)
    return subject, html


async def run_health_reporter():
    if REPORT_DAYS <= 0:
        logger.info("[health-report] desligado (HEALTH_REPORT_DAYS=0)")
        return
    interval = REPORT_DAYS * 86400
    logger.info(f"[health-report] ativo: a cada {REPORT_DAYS:g} dia(s)")
    while True:
        try:
            doc = await db.meta.find_one({"_id": "health_report_last"}) or {}
            due = True
            if doc.get("ts"):
                try:
                    age = (datetime.now(timezone.utc) - datetime.fromisoformat(doc["ts"])).total_seconds()
                    due = age >= interval
                except Exception:
                    due = True
            if due:
                subject, html = await _build_report()
                for email in sorted(ADMIN_EMAILS):
                    await send_email(email, subject, html)
                await db.meta.update_one(
                    {"_id": "health_report_last"},
                    {"$set": {"ts": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
                logger.info("[health-report] enviado")
        except Exception as e:
            logger.warning(f"[health-report] erro (tenta outra vez daqui a 1 h): {e}")
        await asyncio.sleep(_CHECK_EVERY)

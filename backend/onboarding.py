"""Emails de onboarding (sequência de 4) — assente no Resend + email_layout.

Sequência:
- welcome:    logo após a verificação do email (disparado por routes/auth.py).
- activation: ~2 dias após o registo, só se o utilizador ainda não tiver ativos.
- value:      ~5 dias após o registo.
- trial_end:  ~3 dias antes de o teste Pro acabar (só quem está em "trialing").

Um loop de fundo (run_onboarding_emailer) trata dos emails 2-4; cada envio marca
uma flag em users.onboarding_sent (via $addToSet) para nunca repetir. A copy está
nas 6 línguas e sai na língua do utilizador (user_prefs.language, fallback "en").
"""
import asyncio
from datetime import datetime, timezone, timedelta

from core import db, logger, APP_URL
from email_utils import send_email, email_layout, email_strings

APP = (APP_URL or "https://wallet76.com").rstrip("/")


ONBOARDING_I18N = {
    "en": {
        "welcome_subject": "Welcome to Wallet76",
        "welcome_title": "You're in",
        "welcome_body": "Hi {name},<br><br>Your account's confirmed. Now for the part that matters: add your investments. Create a wallet and add your assets — connect a broker or import a CSV, and you'll see everything in one place in seconds.",
        "welcome_cta": "Add my assets",
        "activation_subject": "Your assets are still missing",
        "activation_title": "Your wallet's still empty",
        "activation_body": "Hi {name},<br><br>Looks like you haven't added anything to Wallet76 yet. It takes two minutes: connect a broker or import a file, and you'll see your net worth, P&amp;L and allocation at a glance.",
        "activation_cta": "Get started",
        "value_subject": "Three things Wallet76 does for you",
        "value_title": "Have you tried these yet?",
        "value_body": "Hi {name},<br><br>To get more out of Wallet76:<br><br>• <b>Target allocation</b> — set your percentages and the app tells you what to buy or hold to rebalance.<br>• <b>Price alerts</b> — we ping you by email, Telegram or push when an asset hits your target.<br>• <b>Dividend calendar</b> — see how much you'll get paid, and when.<br><br>It's all waiting in your account.",
        "value_cta": "Explore the app",
        "trial_subject": "Your Pro trial ends in {days} days",
        "trial_title": "{days} days of Pro left",
        "trial_body": "Hi {name},<br><br>Your Pro trial is almost up. To keep unlimited wallets, alerts, broker sync and rebalancing, grab Pro before the trial ends. No pressure — if you do nothing, you'll move to the free plan and won't be charged.",
        "trial_cta": "Keep Pro",
    },
    "pt": {
        "welcome_subject": "Bem-vindo à Wallet76",
        "welcome_title": "Estás dentro",
        "welcome_body": "Olá {name},<br><br>Conta confirmada. Agora falta o essencial: pôr os teus investimentos. Cria uma carteira e adiciona os teus ativos — podes ligar um broker ou importar um CSV, e em segundos vês tudo num só sítio.",
        "welcome_cta": "Adicionar os meus ativos",
        "activation_subject": "Falta pôr os teus ativos",
        "activation_title": "A tua carteira ainda está vazia",
        "activation_body": "Olá {name},<br><br>Reparámos que ainda não puseste nada na Wallet76. Leva dois minutos: liga um broker ou importa um ficheiro, e passas a ver o teu património, o P&amp;L e a alocação num relance.",
        "activation_cta": "Começar agora",
        "value_subject": "Três coisas que a Wallet76 faz por ti",
        "value_title": "Já experimentaste isto?",
        "value_body": "Olá {name},<br><br>Para tirares mais da Wallet76:<br><br>• <b>Alocação-alvo</b> — defines as tuas percentagens e a app diz-te o que comprar ou aguardar para equilibrar a carteira.<br>• <b>Alertas de preço</b> — avisamos-te por email, Telegram ou push quando um ativo chega ao teu alvo.<br>• <b>Calendário de dividendos</b> — vês quanto e quando vais receber.<br><br>Está tudo à espera na tua conta.",
        "value_cta": "Explorar a app",
        "trial_subject": "O teu teste Pro termina em {days} dias",
        "trial_title": "Faltam {days} dias de Pro",
        "trial_body": "Olá {name},<br><br>O teu período de teste do Pro está a chegar ao fim. Se quiseres manter as carteiras ilimitadas, os alertas, a sincronização com brokers e o rebalanceamento, garante o Pro antes que o teste acabe. Sem stress: se não fizeres nada, passas ao plano grátis, sem cobranças.",
        "trial_cta": "Manter o Pro",
    },
    "fr": {
        "welcome_subject": "Bienvenue sur Wallet76",
        "welcome_title": "C'est parti",
        "welcome_body": "Bonjour {name},<br><br>Ton compte est confirmé. Passons à l'essentiel : ajoute tes investissements. Crée un portefeuille et ajoute tes actifs — connecte un courtier ou importe un CSV, et tu vois tout au même endroit en quelques secondes.",
        "welcome_cta": "Ajouter mes actifs",
        "activation_subject": "Il manque tes actifs",
        "activation_title": "Ton portefeuille est encore vide",
        "activation_body": "Bonjour {name},<br><br>On dirait que tu n'as encore rien ajouté sur Wallet76. Deux minutes suffisent : connecte un courtier ou importe un fichier, et tu vois ton patrimoine, ton P&amp;L et ta répartition d'un coup d'œil.",
        "activation_cta": "Commencer",
        "value_subject": "Trois choses que Wallet76 fait pour toi",
        "value_title": "Tu as déjà essayé ?",
        "value_body": "Bonjour {name},<br><br>Pour tirer le meilleur de Wallet76 :<br><br>• <b>Allocation cible</b> — tu fixes tes pourcentages et l'appli te dit quoi acheter ou garder pour rééquilibrer.<br>• <b>Alertes de prix</b> — on te prévient par e-mail, Telegram ou notification quand un actif atteint ton objectif.<br>• <b>Calendrier des dividendes</b> — tu vois combien tu vas toucher, et quand.<br><br>Tout t'attend dans ton compte.",
        "value_cta": "Explorer l'appli",
        "trial_subject": "Ton essai Pro se termine dans {days} jours",
        "trial_title": "Plus que {days} jours de Pro",
        "trial_body": "Bonjour {name},<br><br>Ton essai Pro touche à sa fin. Pour garder les portefeuilles illimités, les alertes, la synchro avec les courtiers et le rééquilibrage, prends Pro avant la fin de l'essai. Sans pression : si tu ne fais rien, tu passes au plan gratuit, sans aucun débit.",
        "trial_cta": "Garder Pro",
    },
    "de": {
        "welcome_subject": "Willkommen bei Wallet76",
        "welcome_title": "Du bist dabei",
        "welcome_body": "Hallo {name},<br><br>Dein Konto ist bestätigt. Jetzt kommt das Wichtige: Füge deine Investitionen hinzu. Leg ein Depot an und trag deine Werte ein — verbinde einen Broker oder importiere eine CSV, und du siehst in Sekunden alles an einem Ort.",
        "welcome_cta": "Werte hinzufügen",
        "activation_subject": "Deine Werte fehlen noch",
        "activation_title": "Dein Depot ist noch leer",
        "activation_body": "Hallo {name},<br><br>Sieht aus, als hättest du bei Wallet76 noch nichts eingetragen. Zwei Minuten reichen: Broker verbinden oder eine Datei importieren, und du siehst dein Vermögen, deinen Gewinn/Verlust und die Aufteilung auf einen Blick.",
        "activation_cta": "Jetzt loslegen",
        "value_subject": "Drei Dinge, die Wallet76 für dich macht",
        "value_title": "Schon ausprobiert?",
        "value_body": "Hallo {name},<br><br>So holst du mehr aus Wallet76 heraus:<br><br>• <b>Zielallokation</b> — du legst deine Prozente fest und die App sagt dir, was du kaufen oder halten sollst, um auszugleichen.<br>• <b>Preisalarme</b> — wir melden uns per E-Mail, Telegram oder Push, wenn ein Wert dein Ziel erreicht.<br>• <b>Dividendenkalender</b> — sieh, wie viel du bekommst und wann.<br><br>Alles wartet in deinem Konto.",
        "value_cta": "App entdecken",
        "trial_subject": "Deine Pro-Testphase endet in {days} Tagen",
        "trial_title": "Noch {days} Tage Pro",
        "trial_body": "Hallo {name},<br><br>Deine Pro-Testphase geht zu Ende. Wenn du unbegrenzte Depots, Alarme, Broker-Sync und Rebalancing behalten willst, hol dir Pro vor Ablauf der Testphase. Ganz entspannt: Wenn du nichts tust, wechselst du zum kostenlosen Plan — ohne Abbuchung.",
        "trial_cta": "Pro behalten",
    },
    "it": {
        "welcome_subject": "Benvenuto su Wallet76",
        "welcome_title": "Ci sei",
        "welcome_body": "Ciao {name},<br><br>Account confermato. Ora la parte che conta: aggiungi i tuoi investimenti. Crea un portafoglio e inserisci i tuoi asset — collega un broker o importa un CSV, e vedi tutto in un posto solo in pochi secondi.",
        "welcome_cta": "Aggiungi i miei asset",
        "activation_subject": "Mancano i tuoi asset",
        "activation_title": "Il tuo portafoglio è ancora vuoto",
        "activation_body": "Ciao {name},<br><br>Sembra che tu non abbia ancora aggiunto niente su Wallet76. Bastano due minuti: collega un broker o importa un file, e vedi il tuo patrimonio, il P&amp;L e l'allocazione a colpo d'occhio.",
        "activation_cta": "Inizia ora",
        "value_subject": "Tre cose che Wallet76 fa per te",
        "value_title": "Le hai già provate?",
        "value_body": "Ciao {name},<br><br>Per sfruttare meglio Wallet76:<br><br>• <b>Allocazione obiettivo</b> — imposti le tue percentuali e l'app ti dice cosa comprare o tenere per riequilibrare.<br>• <b>Avvisi di prezzo</b> — ti avvisiamo via email, Telegram o push quando un asset raggiunge il tuo obiettivo.<br>• <b>Calendario dei dividendi</b> — vedi quanto incassi e quando.<br><br>È tutto lì che ti aspetta nel tuo account.",
        "value_cta": "Esplora l'app",
        "trial_subject": "La tua prova Pro finisce tra {days} giorni",
        "trial_title": "Ancora {days} giorni di Pro",
        "trial_body": "Ciao {name},<br><br>La tua prova Pro sta per finire. Per tenere portafogli illimitati, avvisi, sincronizzazione con i broker e ribilanciamento, prendi Pro prima che la prova scada. Tranquillo: se non fai niente, passi al piano gratuito, senza addebiti.",
        "trial_cta": "Tieni Pro",
    },
    "es": {
        "welcome_subject": "Bienvenido a Wallet76",
        "welcome_title": "Ya estás dentro",
        "welcome_body": "Hola {name},<br><br>Cuenta confirmada. Ahora lo que importa: añade tus inversiones. Crea una cartera y mete tus activos — conecta un bróker o importa un CSV, y lo verás todo en un solo sitio en segundos.",
        "welcome_cta": "Añadir mis activos",
        "activation_subject": "Faltan tus activos",
        "activation_title": "Tu cartera aún está vacía",
        "activation_body": "Hola {name},<br><br>Parece que todavía no has añadido nada en Wallet76. Con dos minutos basta: conecta un bróker o importa un archivo, y verás tu patrimonio, el P&amp;L y la distribución de un vistazo.",
        "activation_cta": "Empezar ahora",
        "value_subject": "Tres cosas que Wallet76 hace por ti",
        "value_title": "¿Ya las has probado?",
        "value_body": "Hola {name},<br><br>Para sacarle más partido a Wallet76:<br><br>• <b>Asignación objetivo</b> — pones tus porcentajes y la app te dice qué comprar o mantener para equilibrar.<br>• <b>Alertas de precio</b> — te avisamos por correo, Telegram o push cuando un activo llega a tu objetivo.<br>• <b>Calendario de dividendos</b> — ves cuánto vas a cobrar y cuándo.<br><br>Todo te espera en tu cuenta.",
        "value_cta": "Explorar la app",
        "trial_subject": "Tu prueba Pro termina en {days} días",
        "trial_title": "Te quedan {days} días de Pro",
        "trial_body": "Hola {name},<br><br>Tu prueba Pro está a punto de acabar. Para mantener las carteras ilimitadas, las alertas, la sincronización con brókers y el rebalanceo, hazte Pro antes de que termine la prueba. Sin agobios: si no haces nada, pasas al plan gratis y no se te cobra.",
        "trial_cta": "Mantener Pro",
    },
}


def _ob(lang):
    code = (lang or "en").lower()[:2]
    return ONBOARDING_I18N.get(code, ONBOARDING_I18N["en"])


def build_ob_email(kind, name, lang, days=None):
    """Devolve (subject, html) para um dos emails de onboarding, ou (None, None)."""
    s = _ob(lang)
    link_hint = email_strings(lang).get("link_hint", "If the button does not work, copy this link:")
    name = name or ""
    if kind == "welcome":
        return s["welcome_subject"], email_layout(
            title=s["welcome_title"], body_html=s["welcome_body"].format(name=name),
            cta_label=s["welcome_cta"], cta_url=f"{APP}/transactions", link_hint=link_hint)
    if kind == "activation":
        return s["activation_subject"], email_layout(
            title=s["activation_title"], body_html=s["activation_body"].format(name=name),
            cta_label=s["activation_cta"], cta_url=f"{APP}/transactions", link_hint=link_hint)
    if kind == "value":
        return s["value_subject"], email_layout(
            title=s["value_title"], body_html=s["value_body"].format(name=name),
            cta_label=s["value_cta"], cta_url=APP, link_hint=link_hint)
    if kind == "trial_end":
        d = days or 1
        return s["trial_subject"].format(days=d), email_layout(
            title=s["trial_title"].format(days=d), body_html=s["trial_body"].format(name=name, days=d),
            cta_label=s["trial_cta"], cta_url=f"{APP}/pricing", link_hint=link_hint)
    return None, None


async def _user_lang(user_id):
    prefs = await db.user_prefs.find_one({"user_id": user_id}, {"_id": 0, "language": 1})
    return (prefs or {}).get("language") or "en"


async def _user_has_assets(user_id):
    n = await db.transactions.count_documents({"user_id": user_id})
    return n > 0


async def _mark_sent(user_id, kind):
    await db.users.update_one({"id": user_id}, {"$addToSet": {"onboarding_sent": kind}})


async def send_welcome_email(user):
    """Chamado no handler de verificação de email (fire-and-forget)."""
    try:
        if "welcome" in set(user.get("onboarding_sent") or []):
            return
        lang = await _user_lang(user["id"])
        subject, html = build_ob_email("welcome", user.get("name") or "", lang)
        if subject:
            await send_email(user["email"], subject, html)
            await _mark_sent(user["id"], "welcome")
    except Exception as e:
        logger.error(f"onboarding welcome falhou ({user.get('email')}): {e}")


async def _send_and_mark(u, kind, days=None):
    lang = await _user_lang(u["id"])
    subject, html = build_ob_email(kind, u.get("name") or "", lang, days)
    if not subject:
        return
    await send_email(u["email"], subject, html)
    await _mark_sent(u["id"], kind)


def _parse_iso(v):
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _parse_trial_end(v):
    # trial_ends_at vem do Stripe como epoch (int); tolera ISO também.
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v, tz=timezone.utc)
        return _parse_iso(v)
    except Exception:
        return None


async def _process_user(u, now):
    sent = set(u.get("onboarding_sent") or [])
    created = _parse_iso(u.get("created_at"))
    if not created:
        return
    age_days = (now - created).total_seconds() / 86400.0

    # Ativação — a partir do 2.º dia, só se ainda não tiver ativos
    if "activation" not in sent and age_days >= 2:
        if await _user_has_assets(u["id"]):
            await _mark_sent(u["id"], "activation")  # já ativou: marca sem enviar
        else:
            await _send_and_mark(u, "activation")
        sent.add("activation")

    # Valor — a partir do 5.º dia
    if "value" not in sent and age_days >= 5:
        await _send_and_mark(u, "value")
        sent.add("value")

    # Fim do teste — em "trialing" e a 3 dias ou menos do fim
    if "trial_end" not in sent and u.get("subscription_status") == "trialing":
        te = _parse_trial_end(u.get("trial_ends_at"))
        if te:
            days_left = (te - now).total_seconds() / 86400.0
            if 0 < days_left <= 3:
                await _send_and_mark(u, "trial_end", days=max(1, round(days_left)))
                sent.add("trial_end")


async def _tick():
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=40)).isoformat()
    cursor = db.users.find(
        {"email_verified": True, "created_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1,
         "onboarding_sent": 1, "subscription_status": 1, "trial_ends_at": 1},
    )
    async for u in cursor:
        try:
            await _process_user(u, now)
        except Exception as e:
            logger.error(f"onboarding: falha a processar {u.get('email')}: {e}")


async def run_onboarding_emailer():
    """Loop de fundo: 1x/hora, envia os emails de onboarding 2-4."""
    await asyncio.sleep(120)  # não correr no arranque a frio
    while True:
        try:
            await _tick()
        except Exception as e:
            logger.error(f"onboarding emailer tick falhou: {e}")
        await asyncio.sleep(3600)

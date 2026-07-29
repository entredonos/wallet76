"""Email layout + Resend send helper."""
import asyncio
from typing import Optional

import resend
from core import RESEND_API_KEY, FROM_EMAIL, APP_URL, logger


def _log_email_task_result(task: asyncio.Task) -> None:
    """Done-callback for fire-and-forget email tasks: surfaces silent failures."""
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return
    if exc:
        logger.warning(f"Email task failed silently: {exc}")


async def send_email(to: str, subject: str, html: str) -> Optional[str]:
    """Sends an email via Resend. Returns email id or None (never raises)."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping email send")
        return None
    try:
        result = await asyncio.to_thread(
            resend.Emails.send,
            {"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html},
        )
        logger.info(f"Email sent to {to}: {result.get('id')}")
        return result.get("id")
    except Exception as e:
        logger.error(f"Resend send failure to {to}: {e}")
        return None


EMAIL_I18N = {
    "en": {
        "verify_subject": "Confirm your Wallet76 email",
        "verify_title": "Confirm your email",
        "verify_body": "Hi {name},<br><br>Welcome to Wallet76! Click the button below to confirm your email address. The link expires in 48 hours.",
        "verify_cta": "Confirm email",
        "reset_subject": "Reset your Wallet76 password",
        "reset_title": "Reset your password",
        "reset_body": "Hi {name},<br><br>We received a request to reset your Wallet76 password. The link below expires in 1 hour.",
        "reset_cta": "Reset password",
        "link_hint": "If the button does not work, copy this link:",
        "alert_subject": "{arrow} {name} ({symbol}) hit {price}",
        "alert_title": "{arrow} Alert triggered: {symbol}",
        "alert_intro": "Your price alert for {asset} has been triggered.",
        "alert_condition": "Condition",
        "alert_above": "above",
        "alert_below": "below",
        "alert_row": "Price {direction} {price}",
        "alert_triggered": "Triggered at",
        "alert_footer": "To manage your alerts or turn off email notifications, go to your Settings page.",
        "alert_cta": "Open Wallet76",
    },
    "pt": {
        "verify_subject": "Confirma o teu email Wallet76",
        "verify_title": "Confirma o teu email",
        "verify_body": "Olá {name},<br><br>Bem-vindo à Wallet76! Clica no botão abaixo para confirmar o teu email. O link expira em 48 horas.",
        "verify_cta": "Confirmar email",
        "reset_subject": "Repor a tua password Wallet76",
        "reset_title": "Repor a tua password",
        "reset_body": "Olá {name},<br><br>Recebemos um pedido para repor a tua password da Wallet76. O link abaixo expira em 1 hora.",
        "reset_cta": "Repor password",
        "link_hint": "Se o botão não funcionar, copia este link:",
        "alert_subject": "{arrow} {name} ({symbol}) chegou a {price}",
        "alert_title": "{arrow} Alerta disparado: {symbol}",
        "alert_intro": "O teu alerta de preço para {asset} foi disparado.",
        "alert_condition": "Condição",
        "alert_above": "acima de",
        "alert_below": "abaixo de",
        "alert_row": "Preço {direction} {price}",
        "alert_triggered": "Disparado a",
        "alert_footer": "Para gerires os teus alertas ou desligares os emails de notificação, vai às Definições.",
        "alert_cta": "Abrir a Wallet76",
    },
    "fr": {
        "verify_subject": "Confirmez votre e-mail Wallet76",
        "verify_title": "Confirmez votre e-mail",
        "verify_body": "Bonjour {name},<br><br>Bienvenue sur Wallet76 ! Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail. Le lien expire dans 48 heures.",
        "verify_cta": "Confirmer l’e-mail",
        "reset_subject": "Réinitialisez votre mot de passe Wallet76",
        "reset_title": "Réinitialiser votre mot de passe",
        "reset_body": "Bonjour {name},<br><br>Nous avons reçu une demande de réinitialisation de votre mot de passe Wallet76. Le lien ci-dessous expire dans 1 heure.",
        "reset_cta": "Réinitialiser",
        "link_hint": "Si le bouton ne fonctionne pas, copiez ce lien :",
        "alert_subject": "{arrow} {name} ({symbol}) a atteint {price}",
        "alert_title": "{arrow} Alerte déclenchée : {symbol}",
        "alert_intro": "Votre alerte de prix pour {asset} s’est déclenchée.",
        "alert_condition": "Condition",
        "alert_above": "au-dessus de",
        "alert_below": "en dessous de",
        "alert_row": "Prix {direction} {price}",
        "alert_triggered": "Déclenchée à",
        "alert_footer": "Pour gérer vos alertes ou désactiver les e-mails de notification, rendez-vous dans vos Réglages.",
        "alert_cta": "Ouvrir Wallet76",
    },
    "de": {
        "verify_subject": "Bestätige deine Wallet76-E-Mail",
        "verify_title": "E-Mail bestätigen",
        "verify_body": "Hallo {name},<br><br>Willkommen bei Wallet76! Klicke auf die Schaltfläche unten, um deine E-Mail-Adresse zu bestätigen. Der Link läuft in 48 Stunden ab.",
        "verify_cta": "E-Mail bestätigen",
        "reset_subject": "Setze dein Wallet76-Passwort zurück",
        "reset_title": "Passwort zurücksetzen",
        "reset_body": "Hallo {name},<br><br>Wir haben eine Anfrage zum Zurücksetzen deines Wallet76-Passworts erhalten. Der Link unten läuft in 1 Stunde ab.",
        "reset_cta": "Passwort zurücksetzen",
        "link_hint": "Falls die Schaltfläche nicht funktioniert, kopiere diesen Link:",
        "alert_subject": "{arrow} {name} ({symbol}) hat {price} erreicht",
        "alert_title": "{arrow} Alarm ausgelöst: {symbol}",
        "alert_intro": "Dein Preisalarm für {asset} wurde ausgelöst.",
        "alert_condition": "Bedingung",
        "alert_above": "über",
        "alert_below": "unter",
        "alert_row": "Preis {direction} {price}",
        "alert_triggered": "Ausgelöst bei",
        "alert_footer": "Um deine Alarme zu verwalten oder E-Mail-Benachrichtigungen abzuschalten, geh zu deinen Einstellungen.",
        "alert_cta": "Wallet76 öffnen",
    },
    "it": {
        "verify_subject": "Conferma la tua email Wallet76",
        "verify_title": "Conferma la tua email",
        "verify_body": "Ciao {name},<br><br>Benvenuto su Wallet76! Clicca sul pulsante qui sotto per confermare il tuo indirizzo email. Il link scade tra 48 ore.",
        "verify_cta": "Conferma email",
        "reset_subject": "Reimposta la tua password Wallet76",
        "reset_title": "Reimposta la password",
        "reset_body": "Ciao {name},<br><br>Abbiamo ricevuto una richiesta di reimpostazione della password di Wallet76. Il link qui sotto scade tra 1 ora.",
        "reset_cta": "Reimposta password",
        "link_hint": "Se il pulsante non funziona, copia questo link:",
        "alert_subject": "{arrow} {name} ({symbol}) ha raggiunto {price}",
        "alert_title": "{arrow} Avviso attivato: {symbol}",
        "alert_intro": "Il tuo avviso di prezzo per {asset} è stato attivato.",
        "alert_condition": "Condizione",
        "alert_above": "sopra",
        "alert_below": "sotto",
        "alert_row": "Prezzo {direction} {price}",
        "alert_triggered": "Attivato a",
        "alert_footer": "Per gestire i tuoi avvisi o disattivare le email di notifica, vai nelle Impostazioni.",
        "alert_cta": "Apri Wallet76",
    },
    "es": {
        "verify_subject": "Confirma tu correo de Wallet76",
        "verify_title": "Confirma tu correo",
        "verify_body": "Hola {name},<br><br>¡Bienvenido a Wallet76! Haz clic en el botón de abajo para confirmar tu correo electrónico. El enlace caduca en 48 horas.",
        "verify_cta": "Confirmar correo",
        "reset_subject": "Restablece tu contraseña de Wallet76",
        "reset_title": "Restablece tu contraseña",
        "reset_body": "Hola {name},<br><br>Recibimos una solicitud para restablecer tu contraseña de Wallet76. El enlace de abajo caduca en 1 hora.",
        "reset_cta": "Restablecer contraseña",
        "link_hint": "Si el botón no funciona, copia este enlace:",
        "alert_subject": "{arrow} {name} ({symbol}) alcanzó {price}",
        "alert_title": "{arrow} Alerta activada: {symbol}",
        "alert_intro": "Tu alerta de precio para {asset} se ha activado.",
        "alert_condition": "Condición",
        "alert_above": "por encima de",
        "alert_below": "por debajo de",
        "alert_row": "Precio {direction} {price}",
        "alert_triggered": "Activada a",
        "alert_footer": "Para gestionar tus alertas o desactivar los correos de notificación, ve a tus Ajustes.",
        "alert_cta": "Abrir Wallet76",
    },
}


def email_strings(lang):
    """Textos de email no idioma do utilizador (fallback en)."""
    code = (lang or "en").lower()[:2]
    return EMAIL_I18N.get(code, EMAIL_I18N["en"])


def email_layout(title: str, body_html: str, cta_label: str = "", cta_url: str = "", link_hint: str = "If the button does not work, copy this link:") -> str:
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr><td align="center" style="padding: 24px 0;">
          <a href="{cta_url}" style="display:inline-block;background:#3b82f6;color:#0a0a0a;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-family:Helvetica,Arial,sans-serif;font-size:15px;">{cta_label}</a>
        </td></tr>
        <tr><td style="padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#71717a;">{link_hint}</td></tr>
        <tr><td style="padding-bottom:24px;font-family:'Courier New',monospace;font-size:11px;color:#a1a1aa;word-break:break-all;">{cta_url}</td></tr>
        """
    return f"""
    <!doctype html><html><body style="background:#0a0a0a;margin:0;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#e4e4e7;">
      <table align="center" width="560" style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:32px;">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #27272a;">
          <div style="font-size:20px;font-weight:300;letter-spacing:-0.02em;color:#fafafa;">Wallet76</div>
          <div style="font-size:11px;color:#71717a;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:0.15em;margin-top:4px;">Investment Portfolio</div>
        </td></tr>
        <tr><td style="padding:24px 0 8px;font-size:22px;font-weight:300;color:#fafafa;">{title}</td></tr>
        <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;color:#d4d4d8;">{body_html}</td></tr>
        {cta_block}
        <tr><td style="padding-top:16px;border-top:1px solid #27272a;font-size:11px;color:#71717a;">If you didn't request this, you can safely ignore this message.</td></tr>
      </table>
    </body></html>
    """


def alert_email_html(
    name: str,
    symbol: str,
    condition: str,
    target_price: float,
    triggered_price: float,
    currency: str = "USD",
    note: str = "",
    app_url: str = "",
    lang: str = "en",
) -> tuple[str, str]:
    """Devolve (assunto, html) do email de um alerta de preço disparado.

    28 jul 2026: este era o último email que ainda estava só em inglês. O
    `alert_checker.py` já sabia a língua de cada pessoa e já a usava no push e
    no Telegram (`_ALERT_TITLE[lang]`), mas na chamada do email não a passava —
    por isso um utilizador português recebia a notificação em português no
    telemóvel e o email em inglês, sobre o mesmo alerta. Agora os textos vêm do
    `EMAIL_I18N`, como nos emails de confirmação e de reposição de password.
    """
    s = email_strings(lang)
    arrow = "▲" if condition == "above" else "▼"
    direction = s["alert_above"] if condition == "above" else s["alert_below"]
    fmt = lambda p: f"${p:,.2f}" if currency == "USD" else f"€{p:,.2f}"

    subject = s["alert_subject"].format(
        arrow=arrow, name=name, symbol=symbol, price=fmt(target_price)
    )

    note_block = (
        f'<div style="margin-top:12px;padding:12px 16px;background:#1f1f23;border-left:3px solid #3b82f6;'
        f'border-radius:4px;font-size:13px;color:#a1a1aa;">{note}</div>'
        if note else ""
    )

    # Os textos saem do EMAIL_I18N para variáveis antes do bloco HTML: dentro de
    # uma f-string com aspas triplas, indexar `s["chave"]` obrigava a alternar
    # aspas e fica ilegível ao lado das centenas de aspas do CSS inline.
    asset = f'<strong style="color:#fafafa;">{name} ({symbol})</strong>'
    intro = s["alert_intro"].format(asset=asset)
    condition_label = s["alert_condition"]
    condition_value = s["alert_row"].format(direction=direction, price=fmt(target_price))
    triggered_label = s["alert_triggered"]
    footer = s["alert_footer"]

    body_html = f"""
    <p style="margin:0 0 16px;">{intro}</p>
    <table width="100%" style="border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #27272a;color:#71717a;font-size:13px;">{condition_label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #27272a;color:#fafafa;font-size:13px;text-align:right;">{condition_value}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#71717a;font-size:13px;">{triggered_label}</td>
        <td style="padding:10px 0;font-size:18px;font-weight:600;color:#86efac;text-align:right;">{fmt(triggered_price)}</td>
      </tr>
    </table>
    {note_block}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">
      {footer}
    </p>
    """

    html = email_layout(
        title=s["alert_title"].format(arrow=arrow, symbol=symbol),
        body_html=body_html,
        cta_label=s["alert_cta"],
        # 28 jul 2026: aqui estava "https://wallet76.vercel.app/alerts" cravado
        # como reserva. Esse é o domínio antigo da Vercel, não o domínio
        # público — quem recebesse o email com o APP_URL por definir ia parar a
        # um endereço que não é o da app. E havia um segundo defeito ao lado:
        # quando o `app_url` VINHA definido, o botão mandava a pessoa para a
        # raiz do site em vez de a levar aos alertas, que são o assunto do
        # email. Agora é sempre <domínio>/alerts, e a reserva é a mesma que o
        # `onboarding.py` já usava.
        cta_url=f"{(app_url or APP_URL or 'https://wallet76.com').rstrip('/')}/alerts",
        link_hint=s["link_hint"],
    )
    return subject, html

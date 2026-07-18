"""Email layout + Resend send helper."""
import asyncio
from typing import Optional

import resend
from core import RESEND_API_KEY, FROM_EMAIL, logger


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
) -> tuple[str, str]:
    """Returns (subject, html) for a triggered price alert email."""
    arrow = "▲" if condition == "above" else "▼"
    direction = "above" if condition == "above" else "below"
    fmt = lambda p: f"${p:,.2f}" if currency == "USD" else f"€{p:,.2f}"

    subject = f"{arrow} {name} ({symbol}) hit {fmt(target_price)}"

    note_block = (
        f'<div style="margin-top:12px;padding:12px 16px;background:#1f1f23;border-left:3px solid #3b82f6;'
        f'border-radius:4px;font-size:13px;color:#a1a1aa;">{note}</div>'
        if note else ""
    )

    body_html = f"""
    <p style="margin:0 0 16px;">Your price alert for <strong style="color:#fafafa;">{name} ({symbol})</strong> has been triggered.</p>
    <table width="100%" style="border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #27272a;color:#71717a;font-size:13px;">Condition</td>
        <td style="padding:10px 0;border-bottom:1px solid #27272a;color:#fafafa;font-size:13px;text-align:right;">Price {direction} {fmt(target_price)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#71717a;font-size:13px;">Triggered at</td>
        <td style="padding:10px 0;font-size:18px;font-weight:600;color:#86efac;text-align:right;">{fmt(triggered_price)}</td>
      </tr>
    </table>
    {note_block}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">
      To manage your alerts or disable email notifications, visit your Settings page.
    </p>
    """

    html = email_layout(
        title=f"{arrow} Alert triggered: {symbol}",
        body_html=body_html,
        cta_label="Open Wallet76",
        cta_url=app_url or "https://wallet76.vercel.app/alerts",
    )
    return subject, html

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


def email_layout(title: str, body_html: str, cta_label: str = "", cta_url: str = "") -> str:
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr><td align="center" style="padding: 24px 0;">
          <a href="{cta_url}" style="display:inline-block;background:#3b82f6;color:#0a0a0a;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-family:Helvetica,Arial,sans-serif;font-size:15px;">{cta_label}</a>
        </td></tr>
        <tr><td style="padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#71717a;">If the button doesn't work, copy this link:</td></tr>
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

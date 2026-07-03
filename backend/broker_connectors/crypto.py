"""Envelope encryption for broker credentials.

Scheme (v2):
  .env          BROKER_ENCRYPTION_KEY  — master Fernet key (never changes)
  MongoDB       user_keys collection   — per-user Fernet key, encrypted with master
  MongoDB       broker_connections     — api_key/secret, encrypted with per-user key
                                         "_enc_v": 2  marks new scheme

Scheme (v1 — legacy, auto-migrated on first sync):
  MongoDB       broker_connections     — encrypted directly with master key, no "_enc_v"

Why this matters:
  v1: stealing DB + .env → decrypt every user's keys in a loop (seconds)
  v2: stealing DB + .env → same result per-key, BUT a DB-only breach reveals nothing
      (user keys are encrypted with master, so without .env the DB dump is useless)
"""
import logging
import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger("wallet76")
_KEY_ENV = "BROKER_ENCRYPTION_KEY"


# ---------------------------------------------------------------------------
# Master key helpers
# ---------------------------------------------------------------------------

def _master_fernet() -> Fernet:
    key = os.environ.get(_KEY_ENV)
    if not key:
        # Do NOT fall back to a silently-generated ephemeral key: on Render's
        # free tier the process restarts/redeploys often, and every restart
        # would then generate a *different* throwaway key — permanently
        # bricking every already-stored broker credential (undecryptable)
        # the moment the process recycles. Fail loudly instead, at the
        # earliest possible point, so a missing env var is caught during
        # deploy/startup rather than silently corrupting user data later.
        raise RuntimeError(
            f"{_KEY_ENV} is not set. Broker credential encryption cannot "
            "start without it — set it in the environment (Render dashboard "
            "or .env) before running. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


# ---------------------------------------------------------------------------
# Legacy v1 (global key) — kept for migration
# ---------------------------------------------------------------------------

def encrypt(plaintext: str) -> str:
    """v1: encrypt with master key directly (legacy, still used for migration path)."""
    return _master_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """v1: decrypt with master key directly."""
    return _master_fernet().decrypt(token.encode()).decode()


# ---------------------------------------------------------------------------
# v2 per-user envelope encryption
# ---------------------------------------------------------------------------

async def get_or_create_user_key(user_id: str) -> bytes:
    """Return the per-user Fernet key bytes, creating and persisting if absent."""
    from core import db  # avoid circular import at module level

    doc = await db.user_keys.find_one({"user_id": user_id})
    if doc:
        try:
            return _master_fernet().decrypt(doc["key_enc"].encode())
        except InvalidToken:
            logger.error("Could not decrypt user key for %s — master key mismatch?", user_id)
            raise

    # First time: generate a fresh key for this user
    user_key = Fernet.generate_key()
    key_enc = _master_fernet().encrypt(user_key).decode()
    await db.user_keys.insert_one({
        "user_id": user_id,
        "key_enc": key_enc,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Created per-user encryption key for %s", user_id)
    return user_key


def encrypt_for_user(plaintext: str, user_key: bytes) -> str:
    """v2: encrypt with per-user key."""
    return Fernet(user_key).encrypt(plaintext.encode()).decode()


def decrypt_for_user(token: str, user_key: bytes) -> str:
    """v2: decrypt with per-user key."""
    return Fernet(user_key).decrypt(token.encode()).decode()


# ---------------------------------------------------------------------------
# Smart decrypt — handles both v1 and v2 transparently
# ---------------------------------------------------------------------------

async def decrypt_conn_field(token: str, user_id: str, enc_v: int = 1) -> str:
    """Decrypt a credential field, auto-detecting v1 vs v2."""
    if enc_v == 2:
        user_key = await get_or_create_user_key(user_id)
        return decrypt_for_user(token, user_key)
    return decrypt(token)  # v1 fallback


async def migrate_conn_to_v2(conn: dict, user_id: str) -> dict:
    """Re-encrypt a v1 connection's credentials with the per-user key.

    Returns the updated credentials_enc dict (caller must save to DB).
    """
    if conn.get("_enc_v", 1) == 2:
        return conn["credentials_enc"]  # already v2, nothing to do

    user_key = await get_or_create_user_key(user_id)
    old_creds = conn["credentials_enc"]
    new_creds = {}
    for field, token in old_creds.items():
        try:
            plaintext = decrypt(token)           # v1: master key
            new_creds[field] = encrypt_for_user(plaintext, user_key)   # v2: user key
        except Exception:
            new_creds[field] = token  # leave as-is if not a real encrypted field
    return new_creds

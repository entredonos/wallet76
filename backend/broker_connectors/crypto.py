"""Envelope encryption for broker credentials.

Scheme (v3 — current, what the landing page/privacy policy actually mean by
"AES-256"):
  .env          BROKER_ENCRYPTION_KEY  — master key (same var as v1/v2, see below)
  MongoDB       user_keys.aes_key_enc  — per-user random 32-byte AES key,
                                         encrypted with the master key (AES-256-GCM)
  MongoDB       broker_connections     — api_key/secret, encrypted with the
                                         per-user AES key (AES-256-GCM)
                                         "_enc_v": 3  marks this scheme
  Wire format:  base64( 12-byte nonce || ciphertext || 16-byte GCM tag )

Scheme (v2 — legacy, auto-migrated to v3 on first sync):
  MongoDB       user_keys.key_enc      — per-user Fernet key, encrypted with master
  MongoDB       broker_connections     — encrypted with per-user Fernet key, "_enc_v": 2
  Fernet is authenticated (AES + HMAC-SHA256), but the cipher itself is
  AES-128-CBC, not AES-256 — hence the migration to v3.

Scheme (v1 — legacy, auto-migrated to v3 on first sync):
  MongoDB       broker_connections     — encrypted directly with master key
                                         (Fernet/AES-128), no "_enc_v"

Why the envelope (v2/v3) matters over v1:
  v1: stealing DB + .env → decrypt every user's keys in a loop (seconds)
  v2/v3: stealing DB + .env → same result per-key, BUT a DB-only breach reveals
      nothing (user keys are encrypted with master, so without .env the DB
      dump is useless)

BROKER_ENCRYPTION_KEY reuse across schemes:
  The env var was generated via `Fernet.generate_key()`, which is 32 random
  bytes, url-safe-base64-encoded — i.e. exactly the raw key material AES-256
  needs. v3 decodes the same env var to get those 32 bytes instead of
  wrapping them in a Fernet object, so no new secret has to be minted or
  added to Render for this migration.
"""
import base64
import logging
import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

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
# v3 per-user envelope encryption — real AES-256-GCM
# ---------------------------------------------------------------------------

def _master_key_bytes() -> bytes:
    """Raw 32-byte key material for AES-256, decoded from BROKER_ENCRYPTION_KEY.

    Same env var v1/v2 use as a Fernet key — see module docstring.
    """
    key = os.environ.get(_KEY_ENV)
    if not key:
        raise RuntimeError(
            f"{_KEY_ENV} is not set. Broker credential encryption cannot "
            "start without it — set it in the environment (Render dashboard "
            "or .env) before running. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return base64.urlsafe_b64decode(key.encode() if isinstance(key, str) else key)


def _aesgcm_encrypt_bytes(plaintext: bytes, key: bytes) -> str:
    """AES-256-GCM encrypt raw bytes → base64(nonce || ciphertext || tag)."""
    nonce = os.urandom(12)  # 96-bit nonce, GCM standard — random per message
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.urlsafe_b64encode(nonce + ct).decode()


def _aesgcm_decrypt_bytes(token: str, key: bytes) -> bytes:
    """Inverse of _aesgcm_encrypt_bytes. Raises on a bad key or tampered token
    (GCM's tag check fails closed, same authenticated-encryption guarantee
    Fernet gave us — nothing here is weaker on that front, only the cipher
    underneath changed from AES-128 to AES-256)."""
    raw = base64.urlsafe_b64decode(token.encode())
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None)


async def get_or_create_user_aes_key(user_id: str) -> bytes:
    """Return the per-user AES-256 key (v3), creating and persisting if absent.

    Stored as a second field ("aes_key_enc") on the SAME user_keys document
    v2 already uses ("key_enc") — a user already on v2 just gains this new
    field via upsert; their existing v2 key/data is untouched, so this can
    roll out to already-migrated-to-v2 users without any extra handling.
    """
    from core import db  # avoid circular import at module level

    doc = await db.user_keys.find_one({"user_id": user_id})
    if doc and doc.get("aes_key_enc"):
        try:
            return _aesgcm_decrypt_bytes(doc["aes_key_enc"], _master_key_bytes())
        except Exception:
            logger.error("Could not decrypt v3 user key for %s — master key mismatch?", user_id)
            raise

    user_key = os.urandom(32)  # 256-bit key
    key_enc = _aesgcm_encrypt_bytes(user_key, _master_key_bytes())
    await db.user_keys.update_one(
        {"user_id": user_id},
        {"$set": {
            "aes_key_enc": key_enc,
            "aes_key_created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    logger.info("Created per-user v3 (AES-256-GCM) encryption key for %s", user_id)
    return user_key


def encrypt_for_user_v3(plaintext: str, user_key: bytes) -> str:
    """v3: AES-256-GCM encrypt with the per-user key."""
    return _aesgcm_encrypt_bytes(plaintext.encode(), user_key)


def decrypt_for_user_v3(token: str, user_key: bytes) -> str:
    """v3: AES-256-GCM decrypt with the per-user key."""
    return _aesgcm_decrypt_bytes(token, user_key).decode()


async def encrypt_totp_secret(user_id: str, secret: str) -> str:
    """Encripta um segredo TOTP em repouso (AES-256-GCM por-utilizador, v3)."""
    user_key = await get_or_create_user_aes_key(user_id)
    return encrypt_for_user_v3(secret, user_key)


async def decrypt_totp_secret(user_id: str, stored: str) -> str:
    """Desencripta um segredo TOTP. Fallback para plaintext: segredos legados
    guardados antes desta encriptacao continuam a funcionar."""
    if not stored:
        return stored
    try:
        user_key = await get_or_create_user_aes_key(user_id)
        return decrypt_for_user_v3(stored, user_key)
    except Exception:
        return stored


# ---------------------------------------------------------------------------
# Smart decrypt — handles v1, v2 and v3 transparently
# ---------------------------------------------------------------------------

async def decrypt_conn_field(token: str, user_id: str, enc_v: int = 1) -> str:
    """Decrypt a credential field, auto-detecting v1 vs v2 vs v3."""
    if enc_v == 3:
        user_key = await get_or_create_user_aes_key(user_id)
        return decrypt_for_user_v3(token, user_key)
    if enc_v == 2:
        user_key = await get_or_create_user_key(user_id)
        return decrypt_for_user(token, user_key)
    return decrypt(token)  # v1 fallback


async def migrate_conn_to_v2(conn: dict, user_id: str) -> dict:
    """Re-encrypt a v1 connection's credentials with the per-user Fernet key.

    Kept for any connection that somehow lands on v1 (shouldn't happen going
    forward — _do_sync migrates straight to v3 now, see migrate_conn_to_v3),
    but left in place rather than deleted since v1 is still a valid _enc_v
    to encounter on an old, never-synced connection.

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


async def migrate_conn_to_v3(conn: dict, user_id: str) -> dict:
    """Re-encrypt a v1 or v2 connection's credentials with the per-user
    AES-256-GCM key (v3).

    Same opportunistic pattern as migrate_conn_to_v2 — triggered lazily on
    a connection's next sync (see _do_sync in routes/brokers.py) rather than
    a one-off bulk script touching every row in broker_connections at once.
    Decrypts each field with whatever scheme it's currently under (v1 or
    v2, via decrypt_conn_field) and re-encrypts with v3.

    Returns the updated credentials_enc dict (caller must save to DB).
    """
    old_enc_v = conn.get("_enc_v", 1)
    if old_enc_v == 3:
        return conn["credentials_enc"]  # already v3, nothing to do

    user_key = await get_or_create_user_aes_key(user_id)
    old_creds = conn["credentials_enc"]
    new_creds = {}
    for field, token in old_creds.items():
        try:
            plaintext = await decrypt_conn_field(token, user_id, old_enc_v)
            new_creds[field] = encrypt_for_user_v3(plaintext, user_key)
        except Exception:
            new_creds[field] = token  # leave as-is if not a real encrypted field
    return new_creds

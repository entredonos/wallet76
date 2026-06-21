"""Security: lock-mode (none | pin | biometric) + WebAuthn (biometric)."""
import json as jsonlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from webauthn import (
    generate_registration_options, verify_registration_response,
    generate_authentication_options, verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor, UserVerificationRequirement,
    AuthenticatorSelectionCriteria, ResidentKeyRequirement,
)
from webauthn.helpers.exceptions import (
    InvalidRegistrationResponse, InvalidAuthenticationResponse,
)

from core import (
    db, get_current_user, hash_password, verify_password,
    b64url_decode, b64url_encode, detect_rp_id, origin_from_req, RP_NAME,
)
from models import LockModeBody, PinBody

router = APIRouter()


@router.get("/security/status")
async def security_status(user=Depends(get_current_user)):
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {
        "lock_mode": sec.get("lock_mode", "none"),
        "has_pin": bool(sec.get("pin_hash")),
        "biometric_count": len(sec.get("webauthn_credentials", [])),
    }


@router.post("/security/lock-mode")
async def set_lock_mode(body: LockModeBody, user=Depends(get_current_user)):
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if body.mode == "pin" and not sec.get("pin_hash"):
        raise HTTPException(400, "PIN not set up")
    if body.mode == "biometric" and not sec.get("webauthn_credentials"):
        raise HTTPException(400, "No biometric credentials registered")
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$set": {"lock_mode": body.mode, "user_id": user["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "mode": body.mode}


@router.post("/security/pin/setup")
async def pin_setup(body: PinBody, user=Depends(get_current_user)):
    pin = (body.pin or "").strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(400, "PIN must be 4-6 digits")
    h = hash_password(pin)
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$set": {"pin_hash": h, "user_id": user["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/security/pin/verify")
async def pin_verify(body: PinBody, user=Depends(get_current_user)):
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    h = sec.get("pin_hash")
    if not h:
        raise HTTPException(404, "PIN not configured")
    if not verify_password(body.pin or "", h):
        raise HTTPException(401, "Invalid PIN")
    return {"ok": True}


@router.delete("/security/pin")
async def pin_delete(user=Depends(get_current_user)):
    current = await db.user_security.find_one({"user_id": user["id"]}) or {}
    new_mode = "none" if current.get("lock_mode") == "pin" else current.get("lock_mode", "none")
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$unset": {"pin_hash": ""}, "$set": {"lock_mode": new_mode}},
    )
    return {"ok": True}


# ----- WebAuthn (biometric) -----
@router.post("/security/biometric/register/options")
async def biometric_register_options(request: Request, user=Depends(get_current_user)):
    rp_id = detect_rp_id(request)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=user["id"].encode(),
        user_name=user.get("email", "user"),
        user_display_name=user.get("name") or user.get("email", "user"),
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.PREFERRED,
            resident_key=ResidentKeyRequirement.PREFERRED,
        ),
    )
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$set": {"webauthn_reg_challenge": b64url_encode(options.challenge), "user_id": user["id"]}},
        upsert=True,
    )
    return jsonlib.loads(options_to_json(options))


@router.post("/security/biometric/register/verify")
async def biometric_register_verify(request: Request, user=Depends(get_current_user)):
    payload = await request.json()
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    challenge_b64 = sec.get("webauthn_reg_challenge")
    if not challenge_b64:
        raise HTTPException(400, "No active registration challenge")
    rp_id = detect_rp_id(request)
    origin = origin_from_req(request)
    try:
        verification = verify_registration_response(
            credential=payload,
            expected_challenge=b64url_decode(challenge_b64),
            expected_origin=origin,
            expected_rp_id=rp_id,
        )
    except InvalidRegistrationResponse as e:
        raise HTTPException(400, f"Verification failed: {e}")

    cred = {
        "id": b64url_encode(verification.credential_id),
        "public_key": b64url_encode(verification.credential_public_key),
        "sign_count": verification.sign_count,
        "device_name": payload.get("device_name") or "Device",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$push": {"webauthn_credentials": cred}, "$unset": {"webauthn_reg_challenge": ""}},
    )
    return {"ok": True, "credential_id": cred["id"]}


@router.post("/security/biometric/auth/options")
async def biometric_auth_options(request: Request, user=Depends(get_current_user)):
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    creds = sec.get("webauthn_credentials", [])
    if not creds:
        raise HTTPException(404, "No biometric credentials")
    rp_id = detect_rp_id(request)
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=b64url_decode(c["id"])) for c in creds
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$set": {"webauthn_auth_challenge": b64url_encode(options.challenge)}},
    )
    return jsonlib.loads(options_to_json(options))


@router.post("/security/biometric/auth/verify")
async def biometric_auth_verify(request: Request, user=Depends(get_current_user)):
    payload = await request.json()
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    challenge_b64 = sec.get("webauthn_auth_challenge")
    if not challenge_b64:
        raise HTTPException(400, "No active auth challenge")
    creds = sec.get("webauthn_credentials", [])
    cred_id = payload.get("id") or payload.get("rawId")
    target = next((c for c in creds if c["id"] == cred_id), None)
    if not target:
        raise HTTPException(404, "Unknown credential")
    rp_id = detect_rp_id(request)
    origin = origin_from_req(request)
    try:
        verification = verify_authentication_response(
            credential=payload,
            expected_challenge=b64url_decode(challenge_b64),
            expected_origin=origin,
            expected_rp_id=rp_id,
            credential_public_key=b64url_decode(target["public_key"]),
            credential_current_sign_count=target.get("sign_count", 0),
        )
    except InvalidAuthenticationResponse as e:
        raise HTTPException(401, f"Auth failed: {e}")

    target["sign_count"] = verification.new_sign_count
    await db.user_security.update_one(
        {"user_id": user["id"], "webauthn_credentials.id": cred_id},
        {"$set": {"webauthn_credentials.$.sign_count": verification.new_sign_count, "webauthn_auth_challenge": None}},
    )
    return {"ok": True}


@router.delete("/security/biometric/{cred_id}")
async def biometric_delete(cred_id: str, user=Depends(get_current_user)):
    await db.user_security.update_one(
        {"user_id": user["id"]},
        {"$pull": {"webauthn_credentials": {"id": cred_id}}},
    )
    sec = await db.user_security.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if not sec.get("webauthn_credentials") and sec.get("lock_mode") == "biometric":
        await db.user_security.update_one(
            {"user_id": user["id"]},
            {"$set": {"lock_mode": "none"}},
        )
    return {"ok": True}

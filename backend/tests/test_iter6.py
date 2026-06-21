"""Iteration 6 tests:
- Bug fix: register no longer auto-logs in (no token, no cookie)
- Bug fix: login with unverified email returns 403 + structured detail
- End-to-end email-verification flow via DB token lookup
- /api/auth/resend-verification is public and idempotent (always 200)
- Regression after server.py refactor: smoke@test.com auth + all main endpoints
"""
import os
import time
import hashlib
import secrets
import asyncio
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wealth-dashboard-413.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

SMOKE_EMAIL = "smoke@test.com"
SMOKE_PASSWORD = "smoke123"


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def smoke_token():
    r = requests.post(f"{API}/auth/login", json={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"smoke login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(smoke_token):
    return {"Authorization": f"Bearer {smoke_token}"}


# ---------------------------------------------------------------------------
# BUG FIX TESTS
# ---------------------------------------------------------------------------
class TestRegisterNoAutoLogin:
    """Register should NOT auto-login the user."""

    def test_register_returns_no_token_no_cookie(self, mongo):
        email = f"test_iter6_reg_{int(time.time()*1000)}@example.com"
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "secret123", "name": "Tester"},
            timeout=30,
        )
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("email") == email
        assert data.get("email_verified") is False
        assert data.get("verification_sent") is True
        # NO token in response body
        assert "token" not in data, f"register response leaks token: {data}"
        assert "access_token" not in data
        # NO access_token cookie set
        assert "access_token" not in r.cookies, f"register sets access_token cookie: {dict(r.cookies)}"

        # cleanup
        mongo.users.delete_one({"email": email})

    def test_register_user_cannot_access_authenticated_endpoint(self, mongo):
        """After register, user cannot hit /api/auth/me (no token issued)."""
        email = f"test_iter6_noauth_{int(time.time()*1000)}@example.com"
        s = requests.Session()
        r = s.post(
            f"{API}/auth/register",
            json={"email": email, "password": "secret123", "name": "NoAuth"},
            timeout=30,
        )
        assert r.status_code == 200
        # Try /auth/me using whatever session state register may have left (should be none)
        r2 = s.get(f"{API}/auth/me", timeout=30)
        assert r2.status_code in (401, 403), f"/auth/me should reject unverified user, got {r2.status_code}"
        mongo.users.delete_one({"email": email})


class TestLoginUnverifiedBlocked:
    """Login with unverified email must return 403 + structured error code."""

    def test_login_unverified_returns_403(self, mongo):
        email = f"test_iter6_unv_{int(time.time()*1000)}@example.com"
        requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "secret123", "name": "Unv"},
            timeout=30,
        )
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "secret123"}, timeout=30)
        assert r.status_code == 403, f"login of unverified user expected 403, got {r.status_code} {r.text}"
        body = r.json()
        detail = body.get("detail")
        assert isinstance(detail, dict), f"detail should be a dict, got {type(detail)}: {detail}"
        assert detail.get("code") == "email_not_verified"
        assert detail.get("email") == email
        assert isinstance(detail.get("message"), str) and len(detail["message"]) > 0
        mongo.users.delete_one({"email": email})


class TestVerificationEndToEnd:
    """Register → fetch DB token → POST /verify-email → login succeeds."""

    def test_full_verification_flow(self, mongo):
        email = f"test_iter6_e2e_{int(time.time()*1000)}@example.com"
        password = "secret123"
        # 1. Register
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": password, "name": "E2E"},
            timeout=30,
        )
        assert r.status_code == 200

        # 2. Inject a known verify token directly in DB (token hash) so we
        # can call /verify-email — we don't have access to the email itself.
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        from datetime import datetime, timezone, timedelta
        expires = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        upd = mongo.users.update_one(
            {"email": email},
            {"$set": {"verify_token_hash": token_hash, "verify_token_expires": expires}},
        )
        assert upd.modified_count == 1

        # 3. Verify
        rv = requests.post(f"{API}/auth/verify-email", json={"token": raw_token}, timeout=30)
        assert rv.status_code == 200, f"verify-email failed: {rv.status_code} {rv.text}"
        assert rv.json().get("ok") is True

        # 4. Login now succeeds
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
        assert rl.status_code == 200, f"login after verify failed: {rl.status_code} {rl.text}"
        data = rl.json()
        assert "token" in data and len(data["token"]) > 0
        # cookie set
        assert "access_token" in rl.cookies, f"login should set access_token cookie: {dict(rl.cookies)}"

        # 5. token works on /auth/me
        rm = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {data['token']}"}, timeout=30)
        assert rm.status_code == 200
        assert rm.json().get("email") == email

        mongo.users.delete_one({"email": email})

    def test_verify_email_invalid_token_returns_400(self):
        """Endpoint exists and validates."""
        r = requests.post(f"{API}/auth/verify-email", json={"token": "garbage-token-does-not-exist"}, timeout=30)
        assert r.status_code == 400


class TestResendVerificationPublic:
    """Resend is public; always 200 to prevent enumeration."""

    def test_resend_unknown_email_returns_200(self):
        r = requests.post(
            f"{API}/auth/resend-verification",
            json={"email": f"unknown_{int(time.time()*1000)}@example.com"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200 for unknown email, got {r.status_code} {r.text}"
        assert r.json().get("ok") is True

    def test_resend_already_verified_returns_200(self):
        # smoke@test.com is verified
        r = requests.post(f"{API}/auth/resend-verification", json={"email": SMOKE_EMAIL}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_resend_no_auth_required(self, mongo):
        """Hit endpoint with no cookies/headers — should still 200."""
        email = f"test_iter6_resend_{int(time.time()*1000)}@example.com"
        requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "secret123", "name": "Resend"},
            timeout=30,
        )
        # raw request — no auth
        r = requests.post(f"{API}/auth/resend-verification", json={"email": email}, timeout=30)
        assert r.status_code == 200
        mongo.users.delete_one({"email": email})


# ---------------------------------------------------------------------------
# REGRESSION — server.py refactor
# ---------------------------------------------------------------------------
class TestRegressionAuthenticated:
    """All authenticated endpoints should still respond 200."""

    @pytest.mark.parametrize("path", [
        "/auth/me",
        "/wallets",
        "/portfolio",
        "/holdings",
        "/transactions",
        "/alerts",
        "/watchlist-groups",
        "/preferences",
        "/security/status",
    ])
    def test_authenticated_endpoint_ok(self, auth_headers, path):
        r = requests.get(f"{API}{path}", headers=auth_headers, timeout=45)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:300]}"


class TestRegressionPublic:
    """All public endpoints should still respond 200."""

    @pytest.mark.parametrize("path", [
        "/fx",
        "/market/movers/crypto",
        "/market/movers/stocks",
        "/market/latest-news",
        "/search/crypto?q=bitcoin",
        "/search/stock?q=AAPL",
    ])
    def test_public_endpoint_ok(self, path):
        r = requests.get(f"{API}{path}", timeout=45)
        # Some upstreams may rate-limit (e.g. CoinGecko 429); allow degraded but not 5xx
        assert r.status_code in (200, 429), f"{path} -> {r.status_code} {r.text[:300]}"
        if r.status_code == 200:
            # JSON parseable
            r.json()

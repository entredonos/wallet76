"""Iteration 7 backend tests: i18n preferences, resend rate-limit, edit transaction,
retroactive 'ALL' history, Mongo indices, regression on existing endpoints."""
import os
import time
import uuid
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


# ----- fixtures -----

@pytest.fixture(scope="session")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="session")
def smoke_token():
    r = requests.post(f"{API}/auth/login", json={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Cannot login smoke user: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture
def auth_headers(smoke_token):
    return {"Authorization": f"Bearer {smoke_token}"}


# ----- Mongo indices -----
class TestMongoIndices:
    def test_verify_token_hash_index(self, mongo):
        idx = mongo.users.index_information()
        assert any("verify_token_hash" in k for k in idx.keys()), f"No verify_token_hash index. Got: {list(idx.keys())}"

    def test_reset_token_hash_index(self, mongo):
        idx = mongo.users.index_information()
        assert any("reset_token_hash" in k for k in idx.keys()), f"No reset_token_hash index. Got: {list(idx.keys())}"


# ----- i18n preferences -----
class TestPreferences:
    def test_get_preferences_returns_lang(self, auth_headers):
        r = requests.get(f"{API}/preferences", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Backend stores under 'language' key
        assert "language" in data, f"Missing 'language' key in preferences: {data}"

    @pytest.mark.parametrize("lang", ["en", "pt", "fr", "de", "it"])
    def test_persist_language(self, auth_headers, lang):
        # PUT (not PATCH) per route signature
        r = requests.put(f"{API}/preferences", headers=auth_headers, json={"language": lang}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/preferences", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("language") == lang


# ----- Resend verification rate-limit -----
class TestResendRateLimit:
    def test_resend_cooldown_within_60s(self, mongo):
        # create disposable unverified user
        email = f"test_iter7_resend_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "passw0rd123", "name": "Iter7"}, timeout=20)
        assert reg.status_code == 200, reg.text
        try:
            # 1st resend: should send (cooldown not set yet by register)
            r1 = requests.post(f"{API}/auth/resend-verification", json={"email": email}, timeout=15)
            assert r1.status_code == 200
            assert r1.json().get("ok") is True
            # 2nd call within 60s: must be cooldown
            r2 = requests.post(f"{API}/auth/resend-verification", json={"email": email}, timeout=15)
            assert r2.status_code == 200
            body2 = r2.json()
            assert body2.get("ok") is True
            assert body2.get("cooldown") is True, f"Expected cooldown True. Got: {body2}"
        finally:
            mongo.users.delete_one({"email": email})

    def test_resend_unknown_email_still_ok(self):
        # Use a syntactically valid email so pydantic EmailStr passes
        r = requests.post(f"{API}/auth/resend-verification", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ----- Edit transaction PATCH -----
class TestEditTransaction:
    def test_patch_transaction_updates_in_place(self, auth_headers):
        # find a wallet
        w = requests.get(f"{API}/wallets", headers=auth_headers, timeout=15).json()
        assert w, "smoke user has no wallets"
        wallet_id = w[0]["id"]
        # create a disposable txn
        payload = {
            "wallet_id": wallet_id,
            "asset_type": "crypto",
            "symbol": "BTC",
            "coingecko_id": "bitcoin",
            "name": "Bitcoin",
            "type": "BUY",
            "date": "2024-01-15",
            "quantity": 0.1,
            "price": 40000.0,
            "fee": 5.0,
            "notes": "iter7-orig",
        }
        c = requests.post(f"{API}/transactions", headers=auth_headers, json=payload, timeout=15)
        assert c.status_code == 200, c.text
        txn = c.json()
        txn_id = txn["id"]
        try:
            patch_body = {"quantity": 0.25, "price": 42000.0, "fee": 7.5, "notes": "iter7-edited", "date": "2024-02-01"}
            p = requests.patch(f"{API}/transactions/{txn_id}", headers=auth_headers, json=patch_body, timeout=15)
            assert p.status_code == 200, p.text
            updated = p.json()
            assert updated["quantity"] == 0.25
            assert updated["price"] == 42000.0
            assert updated["fee"] == 7.5
            assert updated["notes"] == "iter7-edited"
            assert updated["date"] == "2024-02-01"
            # GET to verify persistence
            g = requests.get(f"{API}/transactions", headers=auth_headers, timeout=15)
            assert g.status_code == 200
            found = next((t for t in g.json() if t["id"] == txn_id), None)
            assert found and found["quantity"] == 0.25 and found["notes"] == "iter7-edited"
            # holdings should recompute (just confirm endpoint works)
            h = requests.get(f"{API}/holdings", headers=auth_headers, timeout=15)
            assert h.status_code == 200
        finally:
            requests.delete(f"{API}/transactions/{txn_id}", headers=auth_headers, timeout=15)

    def test_patch_nonexistent_returns_404(self, auth_headers):
        r = requests.patch(f"{API}/transactions/does-not-exist-xyz", headers=auth_headers, json={"quantity": 1.0}, timeout=10)
        assert r.status_code == 404

    def test_patch_empty_body_returns_400(self, auth_headers):
        r = requests.patch(f"{API}/transactions/anything", headers=auth_headers, json={}, timeout=10)
        assert r.status_code == 400


# ----- Retroactive ALL history -----
class TestRetroHistory:
    def test_history_all_range(self, auth_headers):
        # may be slow first time (yfinance)
        r = requests.get(f"{API}/history", headers=auth_headers, params={"range": "all"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        # accepts either list of points or {points: [...]}
        points = body if isinstance(body, list) else body.get("points") or body.get("history") or body.get("data") or []
        assert isinstance(points, list)
        assert len(points) >= 1, f"Expected >=1 history point for 'all'. Got: {body}"
        # validate shape of first point
        p0 = points[0]
        # accept any one of common field names
        has_total = any(k in p0 for k in ("total_usd", "value_usd", "total"))
        assert has_total, f"Missing total field: {p0}"

    def test_history_existing_ranges_still_work(self, auth_headers):
        for rng in ("1d", "1w", "1m", "1y"):
            r = requests.get(f"{API}/history", headers=auth_headers, params={"range": rng}, timeout=20)
            assert r.status_code == 200, f"{rng} failed: {r.text}"


# ----- Regression on existing endpoints -----
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
    "/fx",
    "/market/movers/crypto",
    "/market/latest-news",
])
def test_regression_endpoints(auth_headers, path):
    r = requests.get(f"{API}{path}", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"

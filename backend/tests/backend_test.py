"""
Backend tests for Investment Portfolio Tracker (iteration 2)
Covers: auth, wallets (with currency), transactions CRUD, holdings (computed),
        FX rates, portfolio (with realized P&L + fx_rates), legacy /api/assets removal,
        SELL semantics (realized P&L + out-of-order SELL).
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

SEED_EMAIL = "smoke@test.com"
SEED_PASS = "smoke123"


@pytest.fixture(scope="session")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASS})
    if r.status_code != 200:
        # try register
        r = s.post(f"{API}/auth/register", json={"email": SEED_EMAIL, "password": SEED_PASS, "name": "Smoke"})
    assert r.status_code == 200, f"Login/register failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def fresh_user():
    """Isolated fresh user to avoid colliding with smoke user data."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "T"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.email = email
    return s


# ---------------- Auth basic sanity ----------------
class TestAuth:
    def test_login(self, auth):
        r = auth.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == SEED_EMAIL


# ---------------- FX endpoint ----------------
class TestFx:
    def test_fx_returns_usd_eur_chf(self):
        r = requests.get(f"{API}/fx")
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) >= {"USD", "EUR", "CHF"}
        assert d["USD"] == 1.0
        assert 0.5 < d["EUR"] < 2.0
        assert 0.5 < d["CHF"] < 2.0


# ---------------- Wallets w/ currency ----------------
class TestWalletsCurrency:
    def test_create_eur_wallet(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_EUR_W", "type": "broker", "currency": "EUR"})
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["currency"] == "EUR"
        fresh_user.eur_wallet_id = w["id"]

    def test_create_chf_wallet(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_CHF_W", "type": "exchange", "currency": "CHF"})
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == "CHF"

    def test_create_usd_default_wallet(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_USD_W", "type": "broker"})
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == "USD"
        fresh_user.usd_wallet_id = r.json()["id"]

    def test_list_wallets_has_currency(self, fresh_user):
        r = fresh_user.get(f"{API}/wallets")
        assert r.status_code == 200
        for w in r.json():
            assert "currency" in w
            assert w["currency"] in ("USD", "EUR", "CHF")

    def test_invalid_currency_rejected(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "BAD", "type": "broker", "currency": "GBP"})
        assert r.status_code == 422


# ---------------- Legacy /api/assets removed ----------------
class TestLegacyAssetsRemoved:
    def test_post_assets_gone(self, fresh_user):
        # ensure wallet exists
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_LEGACY_W", "type": "broker"})
        assert r.status_code == 200
        wid = r.json()["id"]
        r = fresh_user.post(f"{API}/assets", json={
            "wallet_id": wid, "symbol": "BTC", "asset_type": "crypto",
            "coingecko_id": "bitcoin", "name": "Bitcoin", "quantity": 0.1, "avg_price": 30000
        })
        # Endpoint should NOT exist
        assert r.status_code in (404, 405), f"Expected 404/405 but got {r.status_code}: {r.text}"


# ---------------- Transactions CRUD ----------------
class TestTransactions:
    @pytest.fixture(scope="class")
    def wallet_usd(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_TX_USD", "type": "broker", "currency": "USD"})
        assert r.status_code == 200
        return r.json()["id"]

    @pytest.fixture(scope="class")
    def wallet_eur(self, fresh_user):
        r = fresh_user.post(f"{API}/wallets", json={"name": "TEST_TX_EUR", "type": "exchange", "currency": "EUR"})
        assert r.status_code == 200
        return r.json()["id"]

    def test_create_buy_usd(self, fresh_user, wallet_usd):
        r = fresh_user.post(f"{API}/transactions", json={
            "wallet_id": wallet_usd, "asset_type": "crypto", "symbol": "BTC",
            "coingecko_id": "bitcoin", "name": "Bitcoin",
            "type": "BUY", "date": "2024-01-15",
            "quantity": 0.5, "price": 40000, "fee": 10,
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["type"] == "BUY"
        assert t["symbol"] == "BTC"
        assert t["currency"] == "USD"
        assert t["fx_to_usd"] == 1.0
        assert "id" in t

    def test_create_buy_eur_has_fx(self, fresh_user, wallet_eur):
        r = fresh_user.post(f"{API}/transactions", json={
            "wallet_id": wallet_eur, "asset_type": "crypto", "symbol": "ETH",
            "coingecko_id": "ethereum", "name": "Ethereum",
            "type": "BUY", "date": "2024-02-01",
            "quantity": 1.0, "price": 2000, "fee": 5,
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["currency"] == "EUR"
        # 1 EUR -> ~1.08 USD ish
        assert t["fx_to_usd"] > 0.5 and t["fx_to_usd"] < 2.0

    def test_list_transactions_sorted_desc(self, fresh_user):
        r = fresh_user.get(f"{API}/transactions")
        assert r.status_code == 200
        txns = r.json()
        assert len(txns) >= 2
        dates = [t["date"] for t in txns]
        assert dates == sorted(dates, reverse=True), f"Not sorted desc: {dates}"

    def test_delete_transaction_and_holdings_recompute(self, fresh_user, wallet_usd):
        # Create a SOL txn we'll delete
        r = fresh_user.post(f"{API}/transactions", json={
            "wallet_id": wallet_usd, "asset_type": "crypto", "symbol": "SOL",
            "coingecko_id": "solana", "name": "Solana",
            "type": "BUY", "date": "2024-03-01",
            "quantity": 10, "price": 100, "fee": 0,
        })
        assert r.status_code == 200
        tid = r.json()["id"]

        # Check holdings has SOL
        r = fresh_user.get(f"{API}/holdings")
        sol = next((h for h in r.json() if h["symbol"] == "SOL"), None)
        assert sol is not None and sol["quantity"] == 10

        # Delete
        r = fresh_user.delete(f"{API}/transactions/{tid}")
        assert r.status_code == 200

        # Holdings should not include SOL
        r = fresh_user.get(f"{API}/holdings")
        sol = next((h for h in r.json() if h["symbol"] == "SOL" and h["quantity"] > 0), None)
        assert sol is None


# ---------------- Holdings (computed) ----------------
class TestHoldings:
    def test_holdings_has_required_fields(self, fresh_user):
        r = fresh_user.get(f"{API}/holdings")
        assert r.status_code == 200
        for h in r.json():
            assert "quantity" in h
            assert "avg_cost_usd" in h
            assert "realized_pnl_usd" in h
            assert "symbol" in h
            assert "wallet_id" in h


# ---------------- SELL semantics ----------------
class TestSellSemantics:
    @pytest.fixture(scope="class")
    def w_usd(self):
        # New isolated user for these calcs
        email = f"test_sell_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "S"})
        assert r.status_code == 200
        s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        r = s.post(f"{API}/wallets", json={"name": "TEST_SELL_USD", "type": "broker", "currency": "USD"})
        assert r.status_code == 200
        return s, r.json()["id"]

    def test_sell_after_buy_realized_pnl(self, w_usd):
        s, wid = w_usd
        # BUY 1 BTC @ 30000 fee 0
        r = s.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "crypto", "symbol": "BTC",
            "coingecko_id": "bitcoin", "name": "Bitcoin",
            "type": "BUY", "date": "2024-01-01",
            "quantity": 1, "price": 30000, "fee": 0,
        })
        assert r.status_code == 200
        # SELL 0.5 BTC @ 50000 fee 100
        r = s.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "crypto", "symbol": "BTC",
            "coingecko_id": "bitcoin", "name": "Bitcoin",
            "type": "SELL", "date": "2024-06-01",
            "quantity": 0.5, "price": 50000, "fee": 100,
        })
        assert r.status_code == 200

        # Expected realized = (50000 - 30000)*0.5 - 100 = 10000 - 100 = 9900
        r = s.get(f"{API}/holdings")
        btc = next((h for h in r.json() if h["symbol"] == "BTC"), None)
        assert btc is not None
        assert btc["quantity"] == pytest.approx(0.5, abs=1e-6)
        assert btc["realized_pnl_usd"] == pytest.approx(9900.0, abs=0.01), btc

    def test_sell_before_buy_is_noop(self):
        # Fresh user
        email = f"test_oob_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "O"})
        s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        r = s.post(f"{API}/wallets", json={"name": "TEST_OOB", "type": "broker", "currency": "USD"})
        wid = r.json()["id"]

        # SELL dated 2024-01-01 then BUY dated 2024-06-01 -> SELL has qty=0 at that date
        s.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "crypto", "symbol": "ETH",
            "coingecko_id": "ethereum", "name": "Ethereum",
            "type": "SELL", "date": "2024-01-01",
            "quantity": 1, "price": 3000, "fee": 0,
        })
        s.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "crypto", "symbol": "ETH",
            "coingecko_id": "ethereum", "name": "Ethereum",
            "type": "BUY", "date": "2024-06-01",
            "quantity": 1, "price": 2000, "fee": 0,
        })
        r = s.get(f"{API}/holdings")
        eth = next((h for h in r.json() if h["symbol"] == "ETH"), None)
        assert eth is not None
        # SELL is no-op (sells min(qty, current_qty=0)=0). BUY adds 1.
        assert eth["quantity"] == pytest.approx(1.0, abs=1e-6)
        assert eth["realized_pnl_usd"] == pytest.approx(0.0, abs=0.01)


# ---------------- Portfolio with new summary fields ----------------
class TestPortfolioSummary:
    def test_portfolio_returns_realized_and_fx(self, auth):
        r = auth.get(f"{API}/portfolio")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "assets" in d
        assert "summary" in d
        s = d["summary"]
        assert "total_realized_pnl_usd" in s
        assert "fx_rates" in s
        fx = s["fx_rates"]
        assert set(fx.keys()) >= {"USD", "EUR", "CHF"}
        assert s["eur_rate"] > 0
        assert s["chf_rate"] > 0

    def test_portfolio_assets_derived_from_transactions(self, auth):
        # After migration, /api/assets collection should be empty for this user.
        # The /portfolio assets should reflect transactions.
        r = auth.get(f"{API}/portfolio")
        assert r.status_code == 200
        # If there are assets present, they should have avg_cost_usd & realized_pnl_usd from txn calc
        for a in r.json()["assets"]:
            assert "avg_cost_usd" in a
            assert "realized_pnl_usd" in a

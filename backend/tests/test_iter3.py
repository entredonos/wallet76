"""
Backend tests for Investment Portfolio Tracker - Iteration 3 features.
Covers: Alerts CRUD + trigger flow, /api/history range param, snapshots bucket_ts,
        stock symbol auto-resolution (3DVELO -> VELO via Yahoo Search).
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def user():
    """Fresh isolated user for iteration 3 tests."""
    email = f"test_i3_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "I3"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    s.email = email
    # create a USD wallet & BUY BTC so alert/portfolio path runs through
    r = s.post(f"{API}/wallets", json={"name": "TEST_I3_USD", "type": "broker", "currency": "USD"})
    assert r.status_code == 200
    wid = r.json()["id"]
    s.post(f"{API}/transactions", json={
        "wallet_id": wid, "asset_type": "crypto", "symbol": "BTC",
        "coingecko_id": "bitcoin", "name": "Bitcoin",
        "type": "BUY", "date": "2024-01-01",
        "quantity": 0.1, "price": 40000, "fee": 0,
    })
    s.wallet_id = wid
    return s


# ---------- Alerts CRUD ----------
class TestAlertsCrud:
    def test_create_alert(self, user):
        r = user.post(f"{API}/alerts", json={
            "symbol": "BTC", "asset_type": "crypto", "coingecko_id": "bitcoin",
            "name": "Bitcoin", "condition": "above", "target_price_usd": 999999.0,
            "note": "TEST"
        })
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["symbol"] == "BTC"
        assert a["condition"] == "above"
        assert a["target_price_usd"] == 999999.0
        assert a["active"] is True
        assert a["triggered_at"] is None
        user.alert_id = a["id"]

    def test_list_alerts(self, user):
        r = user.get(f"{API}/alerts")
        assert r.status_code == 200
        alerts = r.json()
        assert any(a["id"] == user.alert_id for a in alerts)

    def test_patch_alert_target(self, user):
        r = user.patch(f"{API}/alerts/{user.alert_id}", json={"target_price_usd": 888888.0})
        assert r.status_code == 200, r.text
        assert r.json()["target_price_usd"] == 888888.0

    def test_patch_invalid_id(self, user):
        r = user.patch(f"{API}/alerts/nonexistent", json={"target_price_usd": 1.0})
        assert r.status_code == 404

    def test_invalid_condition_rejected(self, user):
        r = user.post(f"{API}/alerts", json={
            "symbol": "ETH", "asset_type": "crypto", "condition": "bad",
            "target_price_usd": 100.0,
        })
        assert r.status_code == 422

    def test_invalid_target_rejected(self, user):
        r = user.post(f"{API}/alerts", json={
            "symbol": "ETH", "asset_type": "crypto", "condition": "above",
            "target_price_usd": -1.0,
        })
        assert r.status_code == 422


# ---------- Alert trigger flow via /api/portfolio ----------
class TestAlertTrigger:
    def test_alert_triggers_on_portfolio_call(self, user):
        # Create alert: BTC above $1 (always triggers if price > 0)
        r = user.post(f"{API}/alerts", json={
            "symbol": "BTC", "asset_type": "crypto", "coingecko_id": "bitcoin",
            "name": "Bitcoin", "condition": "above", "target_price_usd": 1.0,
        })
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        assert r.json()["active"] is True

        # Call /portfolio
        r = user.get(f"{API}/portfolio")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "triggered_alerts" in d
        # If BTC price was fetched successfully, this alert MUST have triggered.
        btc = next((a for a in d["assets"] if a["symbol"] == "BTC"), None)
        if btc and btc.get("price_usd", 0) > 0:
            triggered_ids = [t["id"] for t in d["triggered_alerts"]]
            assert aid in triggered_ids, f"BTC price={btc['price_usd']} > 1 but alert not in triggered_alerts: {d['triggered_alerts']}"
            # Verify alert.active is now False
            r2 = user.get(f"{API}/alerts")
            this_alert = next((x for x in r2.json() if x["id"] == aid), None)
            assert this_alert is not None
            assert this_alert["active"] is False
            assert this_alert["triggered_at"] is not None
            assert this_alert["triggered_price_usd"] is not None
        else:
            pytest.skip("BTC price not fetched (CoinGecko unreachable) - cannot verify trigger")

    def test_patch_reactivates_alert(self, user):
        # Create + force-trigger an alert
        r = user.post(f"{API}/alerts", json={
            "symbol": "BTC", "asset_type": "crypto", "coingecko_id": "bitcoin",
            "name": "Bitcoin", "condition": "above", "target_price_usd": 1.0,
        })
        aid = r.json()["id"]
        user.get(f"{API}/portfolio")  # trigger

        # Reactivate
        r = user.patch(f"{API}/alerts/{aid}", json={"active": True})
        assert r.status_code == 200, r.text
        a = r.json()
        # triggered_at must be cleared on reactivation
        assert a["active"] is True
        assert a.get("triggered_at") is None
        assert a.get("triggered_price_usd") is None


# ---------- Alert delete ----------
class TestAlertDelete:
    def test_delete_alert(self, user):
        r = user.post(f"{API}/alerts", json={
            "symbol": "ETH", "asset_type": "crypto", "coingecko_id": "ethereum",
            "name": "Ethereum", "condition": "below", "target_price_usd": 0.01,
        })
        aid = r.json()["id"]
        r = user.delete(f"{API}/alerts/{aid}")
        assert r.status_code == 200

        r = user.get(f"{API}/alerts")
        assert not any(a["id"] == aid for a in r.json())

    def test_delete_nonexistent(self, user):
        r = user.delete(f"{API}/alerts/does-not-exist")
        assert r.status_code == 404


# ---------- History endpoint with range ----------
class TestHistory:
    @pytest.mark.parametrize("rng", ["1d", "1w", "1m", "1y", "all"])
    def test_history_range(self, user, rng):
        r = user.get(f"{API}/history", params={"range": rng})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for item in data:
            assert "ts" in item
            assert "total_usd" in item
            assert "total_pnl_usd" in item

    def test_history_has_data_after_portfolio_call(self, user):
        # Trigger a snapshot
        user.get(f"{API}/portfolio")
        r = user.get(f"{API}/history", params={"range": "1d"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1, "Expected at least 1 history point after /portfolio call"


# ---------- Snapshots bucket_ts ----------
class TestSnapshotsBucket:
    def test_snapshots_have_bucket_ts(self, user):
        user.get(f"{API}/portfolio")  # generate at least one bucketed snapshot
        r = user.get(f"{API}/snapshots")
        assert r.status_code == 200
        snaps = r.json()
        # At least one snapshot must have bucket_ts (the one just upserted)
        bucketed = [s for s in snaps if s.get("bucket_ts")]
        assert len(bucketed) >= 1, f"No snapshot has bucket_ts. Snaps: {snaps}"
        # bucket_ts must be ISO datetime, minute should be a multiple of 15
        from datetime import datetime
        bts = datetime.fromisoformat(bucketed[-1]["bucket_ts"])
        assert bts.minute % 15 == 0, f"bucket_ts minute not aligned to 15: {bts}"
        assert bts.second == 0


# ---------- Stock symbol auto-resolve (3DVELO -> VELO) ----------
class TestStockResolution:
    def test_unknown_stock_symbol_resolves(self, user):
        # Set up a wallet+txn for 3DVELO; then /portfolio should yield a price via Yahoo Search resolution.
        r = user.post(f"{API}/wallets", json={"name": "TEST_3DVELO", "type": "broker", "currency": "USD"})
        wid = r.json()["id"]
        r = user.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "stock", "symbol": "3DVELO",
            "name": "3DVELO Test", "type": "BUY", "date": "2024-01-01",
            "quantity": 1, "price": 1, "fee": 0,
        })
        assert r.status_code == 200, r.text

        r = user.get(f"{API}/portfolio")
        assert r.status_code == 200
        velo = next((a for a in r.json()["assets"] if a["symbol"] == "3DVELO"), None)
        assert velo is not None
        # We accept either resolution succeeded OR Yahoo Search unreachable from this region.
        # If price > 0, that means resolver worked. Otherwise we skip with a warning.
        if velo.get("price_usd", 0) == 0:
            pytest.skip(f"3DVELO did not resolve to a price (Yahoo Search may be blocked or symbol changed). asset={velo}")
        assert velo["price_usd"] > 0

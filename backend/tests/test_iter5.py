"""
Iteration 5 backend tests — watchlist-groups (sub-watchlists with cascade delete + 10/group + 20-group cap),
backwards-compat /api/watchlists, wallets list (Eliminar button source of truth).
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


def _new_user():
    email = f"test_i5_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "I5"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def user():
    return _new_user()


# ---------- /api/watchlist-groups ----------
class TestWatchlistGroupsAutoDefault:
    def test_get_creates_default_group(self, user):
        r = user.get(f"{API}/watchlist-groups")
        assert r.status_code == 200, r.text
        groups = r.json()
        assert isinstance(groups, list) and len(groups) >= 1
        # First is the auto-created Default
        assert groups[0]["name"] == "Default"
        assert "items" in groups[0] and isinstance(groups[0]["items"], list)
        assert groups[0]["items"] == []


class TestWatchlistGroupCreateDelete:
    def test_create_group_then_delete_with_cascade(self):
        s = _new_user()
        # Ensure default exists
        s.get(f"{API}/watchlist-groups")
        # Create sub group "Crypto Picks"
        r = s.post(f"{API}/watchlist-groups", json={"name": "Crypto Picks"})
        assert r.status_code == 200, r.text
        g = r.json()
        gid = g["id"]
        assert g["name"] == "Crypto Picks"
        assert g["items"] == []

        # Add BTC + ETH into that group
        r1 = s.post(f"{API}/watchlists", json={
            "symbol": "BTC", "asset_type": "crypto", "coingecko_id": "bitcoin",
            "name": "Bitcoin", "group_id": gid,
        })
        assert r1.status_code == 200, r1.text
        assert r1.json()["group_id"] == gid

        r2 = s.post(f"{API}/watchlists", json={
            "symbol": "ETH", "asset_type": "crypto", "coingecko_id": "ethereum",
            "name": "Ethereum", "group_id": gid,
        })
        assert r2.status_code == 200

        # GET watchlist-groups should show 2 items in Crypto Picks
        r = s.get(f"{API}/watchlist-groups")
        groups = r.json()
        cp = next((x for x in groups if x["id"] == gid), None)
        assert cp is not None
        assert len(cp["items"]) == 2
        syms = sorted(i["symbol"] for i in cp["items"])
        assert syms == ["BTC", "ETH"]

        # Flat /watchlists endpoint should also include both
        r_flat = s.get(f"{API}/watchlists")
        assert r_flat.status_code == 200
        flat_syms = [w["symbol"] for w in r_flat.json()]
        assert "BTC" in flat_syms and "ETH" in flat_syms

        # DELETE group — cascade: items should be gone too
        r = s.delete(f"{API}/watchlist-groups/{gid}")
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # The group is gone
        r = s.get(f"{API}/watchlist-groups")
        assert all(g["id"] != gid for g in r.json())

        # Cascade verified: BTC/ETH no longer in flat list
        r_flat = s.get(f"{API}/watchlists")
        flat_syms = [w["symbol"] for w in r_flat.json()]
        assert "BTC" not in flat_syms and "ETH" not in flat_syms

    def test_delete_unknown_group_returns_404(self, user):
        r = user.delete(f"{API}/watchlist-groups/does-not-exist")
        assert r.status_code == 404

    def test_create_with_invalid_group_id_returns_404(self, user):
        r = user.post(f"{API}/watchlists", json={
            "symbol": "ADA", "asset_type": "crypto", "coingecko_id": "cardano",
            "name": "Cardano", "group_id": "ghost-group",
        })
        assert r.status_code == 404


class TestPerGroupTenLimit:
    def test_max_ten_items_per_group(self):
        s = _new_user()
        # Create a fresh group
        r = s.post(f"{API}/watchlist-groups", json={"name": "BigList"})
        gid = r.json()["id"]

        coins = ["bitcoin", "ethereum", "solana", "cardano", "ripple",
                 "polkadot", "dogecoin", "tron", "litecoin", "stellar"]
        for cg in coins:
            r = s.post(f"{API}/watchlists", json={
                "symbol": cg[:5].upper(), "asset_type": "crypto",
                "coingecko_id": cg, "name": cg, "group_id": gid,
            })
            assert r.status_code == 200, f"failed at {cg}: {r.text}"
        # 11th must fail with 400
        r = s.post(f"{API}/watchlists", json={
            "symbol": "AVAX", "asset_type": "crypto",
            "coingecko_id": "avalanche-2", "name": "Avalanche", "group_id": gid,
        })
        assert r.status_code == 400, r.text

        # But same user can still add to a DIFFERENT group (per-group cap, not global)
        r = s.post(f"{API}/watchlist-groups", json={"name": "Other"})
        other = r.json()["id"]
        r = s.post(f"{API}/watchlists", json={
            "symbol": "AVAX", "asset_type": "crypto",
            "coingecko_id": "avalanche-2", "name": "Avalanche", "group_id": other,
        })
        assert r.status_code == 200, r.text


class TestEmptyGroupNameRejected:
    def test_empty_name(self, user):
        r = user.post(f"{API}/watchlist-groups", json={"name": "   "})
        assert r.status_code == 400


# ---------- Wallets — "Eliminar" button source of truth ----------
class TestWalletsDelete:
    def test_create_then_delete_wallet_cascades_tx(self):
        s = _new_user()
        # Create wallet
        r = s.post(f"{API}/wallets", json={"name": "TEST_I5_W", "type": "broker", "currency": "USD"})
        assert r.status_code == 200, r.text
        wid = r.json()["id"]

        # Add a tx
        r = s.post(f"{API}/transactions", json={
            "wallet_id": wid, "asset_type": "crypto", "symbol": "BTC",
            "coingecko_id": "bitcoin", "name": "Bitcoin",
            "type": "BUY", "date": "2024-01-01",
            "quantity": 0.01, "price": 40000, "fee": 0,
        })
        assert r.status_code == 200

        before = s.get(f"{API}/wallets").json()
        assert any(w["id"] == wid for w in before)

        # Delete
        r = s.delete(f"{API}/wallets/{wid}")
        assert r.status_code == 200

        after = s.get(f"{API}/wallets").json()
        assert all(w["id"] != wid for w in after)
        assert len(after) == len(before) - 1

        # Transactions for that wallet should be gone
        r = s.get(f"{API}/transactions")
        assert r.status_code == 200
        assert all(t.get("wallet_id") != wid for t in r.json())

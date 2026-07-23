"""Testes unitários da lógica de posições + P&L realizado
(prices.compute_holdings_from_txns) — custo médio ponderado, venda (realized),
taxas, conversão fx_to_usd, venda a mais (oversell) e posição totalmente
fechada. É lógica sensível de dinheiro, por isso vale fixá-la em testes.

Puro: recebe uma lista de dicts e devolve uma lista de dicts. Sem rede/DB.
"""
import pytest

from prices import compute_holdings_from_txns


def _tx(**kw):
    base = {"wallet_id": "w1", "asset_type": "crypto", "symbol": "BTC",
            "type": "BUY", "date": "2026-01-01", "quantity": 1,
            "price": 100, "fee": 0}
    base.update(kw)
    return base


def _one(txns):
    hs = compute_holdings_from_txns(txns)
    assert len(hs) == 1
    return hs[0]


class TestWeightedAverageCost:
    def test_single_buy(self):
        h = _one([_tx(quantity=10, price=100)])
        assert h["quantity"] == 10
        assert h["avg_cost_usd"] == 100
        assert h["total_cost_usd"] == 1000
        assert h["realized_pnl_usd"] == 0

    def test_two_buys_weighted_average(self):
        h = _one([_tx(quantity=10, price=100, date="2026-01-01"),
                  _tx(quantity=10, price=200, date="2026-01-02")])
        assert h["quantity"] == 20
        assert h["avg_cost_usd"] == 150      # (1000+2000)/20
        assert h["total_cost_usd"] == 3000

    def test_buy_fee_adds_to_cost(self):
        h = _one([_tx(quantity=1, price=100, fee=10)])
        assert h["total_cost_usd"] == 110
        assert h["avg_cost_usd"] == 110


class TestRealizedPnl:
    def test_sell_profit(self):
        h = _one([_tx(quantity=10, price=100, date="2026-01-01"),
                  _tx(quantity=10, price=200, date="2026-01-02"),
                  _tx(type="SELL", quantity=5, price=200, date="2026-01-03")])
        # avg 150, vende 5 @ 200 -> (200-150)*5 = 250
        assert h["realized_pnl_usd"] == 250
        assert h["quantity"] == 15
        assert h["avg_cost_usd"] == 150       # média não muda numa venda
        assert h["total_cost_usd"] == 2250    # 3000 - 150*5

    def test_sell_fee_reduces_realized(self):
        h = _one([_tx(quantity=10, price=100, date="2026-01-01"),
                  _tx(type="SELL", quantity=5, price=120, fee=10, date="2026-01-02")])
        # (120-100)*5 - 10 = 90
        assert h["realized_pnl_usd"] == 90

    def test_full_close_resets_position(self):
        h = _one([_tx(quantity=10, price=100, date="2026-01-01"),
                  _tx(type="SELL", quantity=10, price=130, date="2026-01-02")])
        assert h["quantity"] == 0
        assert h["total_cost_usd"] == 0
        assert h["realized_pnl_usd"] == 300

    def test_multiple_sells_accumulate_realized(self):
        h = _one([_tx(quantity=20, price=150, date="2026-01-01"),
                  _tx(type="SELL", quantity=5, price=200, date="2026-01-02"),
                  _tx(type="SELL", quantity=15, price=100, date="2026-01-03")])
        # +250 e depois (100-150)*15 = -750 -> -500
        assert h["realized_pnl_usd"] == -500
        assert h["quantity"] == 0


class TestEdgeCases:
    def test_oversell_clamps_to_held_quantity(self):
        # tem 5, tenta vender 10 -> só vende 5, fecha a posição
        h = _one([_tx(quantity=5, price=100, date="2026-01-01"),
                  _tx(type="SELL", quantity=10, price=120, date="2026-01-02")])
        assert h["quantity"] == 0
        assert h["realized_pnl_usd"] == 100   # (120-100)*5

    def test_fx_to_usd_applied_to_price_and_fee(self):
        h = _one([_tx(quantity=2, price=100, fee=10, fx_to_usd=0.5)])
        # price_usd = 50, fee_usd = 5 -> total = 50*2 + 5 = 105
        assert h["total_cost_usd"] == 105

    def test_separate_keys_per_wallet_and_symbol(self):
        hs = compute_holdings_from_txns([
            _tx(symbol="BTC", wallet_id="w1"),
            _tx(symbol="ETH", wallet_id="w1"),
            _tx(symbol="BTC", wallet_id="w2"),
        ])
        keys = {(h["wallet_id"], h["symbol"]) for h in hs}
        assert keys == {("w1", "BTC"), ("w1", "ETH"), ("w2", "BTC")}

    def test_symbol_uppercased(self):
        h = _one([_tx(symbol="btc")])
        assert h["symbol"] == "BTC"

    def test_out_of_order_dates_sorted_before_processing(self):
        # SELL registada com data anterior à BUY não deve gerar realized do nada:
        # ordena por data primeiro, por isso a BUY (jan-01) processa antes.
        h = _one([_tx(type="SELL", quantity=5, price=200, date="2026-01-02"),
                  _tx(type="BUY", quantity=10, price=100, date="2026-01-01")])
        assert h["quantity"] == 5
        assert h["realized_pnl_usd"] == 500   # (200-100)*5

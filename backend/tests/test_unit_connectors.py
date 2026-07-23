"""Testes UNITÁRIOS puros (sem rede, sem DB, sem servidor a correr) da lógica
crítica dos conectores de corretoras — a parte que já causou bugs reais:
classificação caixa/cripto, mapeamento de trades e limpeza de símbolos.

Correr:  pytest backend/tests/test_unit_connectors.py -q
"""
import pytest

from broker_connectors.ccxt_generic import (
    classify_balance_currency,
    _map_trade,
    _short,
)
from broker_connectors import xtb


# --------------------------------------------------------------------------
# classify_balance_currency — regra CAIXA vs CRIPTO (bug "DOGE = Ações",
# "carteira Bybit a 0%"). Stablecoins/fiat = liquidez; resto = cripto.
# --------------------------------------------------------------------------
class TestClassifyBalanceCurrency:
    @pytest.mark.parametrize(
        "cur", ["USDT", "USDC", "USD", "DAI", "TUSD", "FDUSD",
                "BUSD", "USDP", "PYUSD", "usdt", "Usdc"]
    )
    def test_stablecoins_are_cash_at_par(self, cur):
        at, price, pcur = classify_balance_currency(cur)
        assert at == "cash"
        assert price == 1.0
        assert pcur == "USD"

    @pytest.mark.parametrize("cur", ["EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"])
    def test_fiat_is_cash_in_own_currency(self, cur):
        at, price, pcur = classify_balance_currency(cur)
        assert at == "cash"
        assert price == 1.0
        assert pcur == cur.upper()

    @pytest.mark.parametrize("cur", ["BTC", "ETH", "DOGE", "SOL", "XRP", "ada"])
    def test_real_crypto_is_uncosted_crypto(self, cur):
        at, price, pcur = classify_balance_currency(cur)
        assert at == "crypto"
        assert price is None          # preço resolvido a jusante via ticker
        assert pcur == "USD"

    def test_none_and_empty_default_to_crypto(self):
        assert classify_balance_currency("")[0] == "crypto"
        assert classify_balance_currency(None)[0] == "crypto"


# --------------------------------------------------------------------------
# _map_trade — normalização de um trade ccxt para o nosso formato de transação.
# --------------------------------------------------------------------------
class TestMapTrade:
    def _tr(self, **kw):
        base = {"amount": 2, "price": 100, "side": "buy",
                "timestamp": 1_600_000_000_000, "symbol": "ETH/USDT", "id": "t1"}
        base.update(kw)
        return base

    def test_buy_in_usdt(self):
        r = _map_trade(self._tr(), "eth", "USDT", 30000.0, "binance")
        assert r["type"] == "BUY"
        assert r["symbol"] == "ETH"          # base em maiúsculas
        assert r["quantity"] == 2
        assert r["price_usd"] == 100
        assert r["asset_type"] == "crypto"
        assert r["_broker"] == "binance"

    def test_sell_side(self):
        r = _map_trade(self._tr(side="sell"), "eth", "USDT", 30000.0, "binance")
        assert r["type"] == "SELL"

    def test_btc_quote_multiplies_by_btc_usd(self):
        r = _map_trade(self._tr(price=0.01, symbol="ETH/BTC"),
                       "eth", "BTC", 30000.0, "binance")
        assert r["price_usd"] == pytest.approx(0.01 * 30000.0)

    def test_zero_amount_or_price_is_dropped(self):
        assert _map_trade(self._tr(amount=0), "eth", "USDT", 30000.0, "x") is None
        assert _map_trade(self._tr(price=0), "eth", "USDT", 30000.0, "x") is None

    def test_fee_only_counted_when_in_usd_family(self):
        in_usd = _map_trade(self._tr(fee={"cost": 0.5, "currency": "USDT"}),
                            "eth", "USDT", 1.0, "x")
        assert in_usd["fee"] == 0.5
        in_eth = _map_trade(self._tr(fee={"cost": 0.001, "currency": "ETH"}),
                            "eth", "USDT", 1.0, "x")
        assert in_eth["fee"] == 0.0          # taxa não-USD não é contabilizada

    def test_negative_values_taken_absolute(self):
        r = _map_trade(self._tr(amount=-3, price=-50), "eth", "USDT", 1.0, "x")
        assert r["quantity"] == 3
        assert r["price_usd"] == 50

    def test_date_is_iso_format(self):
        r = _map_trade(self._tr(timestamp=1_600_000_000_000), "eth", "USDT", 1.0, "x")
        assert len(r["date"]) == 10 and r["date"][4] == "-" and r["date"][7] == "-"

    def test_missing_timestamp_falls_back_to_today(self):
        r = _map_trade(self._tr(timestamp=None), "eth", "USDT", 1.0, "x")
        assert len(r["date"]) == 10


# --------------------------------------------------------------------------
# _short — encurtar mensagens de erro da exchange.
# --------------------------------------------------------------------------
class TestShort:
    def test_truncates_over_180(self):
        out = _short("x" * 300)
        assert len(out) == 181 and out.endswith("…")

    def test_short_message_passthrough(self):
        assert _short("boom") == "boom"

    def test_empty_becomes_placeholder(self):
        assert _short("") == "erro desconhecido"

    def test_newlines_collapsed(self):
        assert "\n" not in _short("linha1\nlinha2")


# --------------------------------------------------------------------------
# xtb._clean_symbol — ticker XTB -> convenção do fornecedor de preços (Yahoo).
# --------------------------------------------------------------------------
class TestXtbCleanSymbol:
    def test_crypto_name_map(self):
        assert xtb._clean_symbol("BITCOIN", True) == "BTC"
        assert xtb._clean_symbol("ETHEREUM", True) == "ETH"
        assert xtb._clean_symbol("dogecoin", True) == "DOGE"

    def test_crypto_splits_on_dot(self):
        assert xtb._clean_symbol("BITCOIN.X", True) == "BTC"

    def test_crypto_unknown_passthrough(self):
        assert xtb._clean_symbol("FOO", True) == "FOO"

    def test_us_suffix_stripped(self):
        assert xtb._clean_symbol("AAPL.US", False) == "AAPL"
        assert xtb._clean_symbol("AAPL.US_9", False) == "AAPL"

    def test_uk_becomes_london(self):
        assert xtb._clean_symbol("VOD.UK", False) == "VOD.L"

    def test_pt_becomes_lisbon(self):
        assert xtb._clean_symbol("EDP.PT", False) == "EDP.LS"

    def test_de_suffix_kept(self):
        assert xtb._clean_symbol("BMW.DE", False) == "BMW.DE"

    def test_no_suffix_passthrough(self):
        assert xtb._clean_symbol("TSLA", False) == "TSLA"


# --------------------------------------------------------------------------
# xtb._leg — construção de uma perna (leg) de transação.
# --------------------------------------------------------------------------
class TestXtbLeg:
    def test_builds_leg_fields(self):
        leg = xtb._leg("AAPL", "stock", "BUY", 150.0, 1_600_000_000_000,
                       10, "USD", 1.5, "AAPL.US", 42, "open")
        assert leg["symbol"] == "AAPL"
        assert leg["asset_type"] == "stock"
        assert leg["type"] == "BUY"
        assert leg["quantity"] == 10.0
        assert leg["price_usd"] == 150.0
        assert leg["price_currency"] == "USD"
        assert leg["fee"] == 1.5
        assert leg["_broker"] == "xtb"
        assert leg["_broker_id"] == "xtb_open_42"

    def test_absolute_values_and_none_fee(self):
        leg = xtb._leg("X", "crypto", "SELL", -5, 0, -3, "EUR", None, "X", 1, "close")
        assert leg["quantity"] == 3.0
        assert leg["price_usd"] == 5.0
        assert leg["fee"] == 0.0
        assert leg["_broker_id"] == "xtb_close_1"

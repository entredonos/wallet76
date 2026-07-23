"""Testes unitários das funções de parsing de TODOS os conectores de corretoras
ainda sem cobertura (binance, kraken, trading212, degiro, coinbase). Puro, sem
rede/DB — apanha os "surpresa-IBKR": campo errado, crash num caso limite,
compra/venda trocada, símbolo mal extraído. ccxt_generic, xtb e ibkr já têm
testes próprios noutros ficheiros.
"""
import pytest

from broker_connectors import binance, kraken, trading212, degiro, coinbase


# ─────────────────────────── Binance ───────────────────────────
class TestBinanceMapTrade:
    def _t(self, **kw):
        b = {"isBuyer": True, "qty": 2, "price": 100, "commission": 0,
             "commissionAsset": "USDT", "time": 1_600_000_000_000, "id": 7}
        b.update(kw); return b

    def test_buy_usdt(self):
        r = binance._map_trade(self._t(), "ETHUSDT", "eth", "USDT", 30000.0)
        assert r["type"] == "BUY" and r["symbol"] == "ETH"
        assert r["price_usd"] == 100 and r["asset_type"] == "crypto"

    def test_sell_when_not_buyer(self):
        assert binance._map_trade(self._t(isBuyer=False), "ETHUSDT", "eth", "USDT", 1.0)["type"] == "SELL"

    def test_btc_quote_scaled(self):
        r = binance._map_trade(self._t(price=0.01), "ETHBTC", "eth", "BTC", 30000.0)
        assert r["price_usd"] == pytest.approx(0.01 * 30000.0)

    def test_zero_qty_or_price_dropped(self):
        assert binance._map_trade(self._t(qty=0), "X", "e", "USDT", 1.0) is None
        assert binance._map_trade(self._t(price=0), "X", "e", "USDT", 1.0) is None

    def test_fee_only_in_usd_family(self):
        assert binance._map_trade(self._t(commission=0.5, commissionAsset="USDT"), "X", "e", "USDT", 1.0)["fee"] == 0.5
        assert binance._map_trade(self._t(commission=0.001, commissionAsset="ETH"), "X", "e", "USDT", 1.0)["fee"] == 0.0


# ─────────────────────────── Kraken ───────────────────────────
class TestKrakenSymbols:
    def test_clean_symbol_map(self):
        assert kraken._clean_symbol("XXBT") == "BTC"
        assert kraken._clean_symbol("ZUSD") == "USD"
        assert kraken._clean_symbol("XETH") == "ETH"

    def test_clean_symbol_strip_fallback(self):
        assert kraken._clean_symbol("SOL") == "SOL"

    def test_parse_pair_prefixed(self):
        assert kraken._parse_pair("XXBTZUSD") == ("BTC", "USD")
        assert kraken._parse_pair("XETHZEUR") == ("ETH", "EUR")

    def test_parse_pair_plain(self):
        assert kraken._parse_pair("SOLUSD") == ("SOL", "USD")


class TestKrakenMapTrade:
    def _t(self, **kw):
        b = {"type": "buy", "ordertype": "market", "pair": "XXBTZEUR",
             "vol": 0.5, "price": 30000, "cost": 15000, "fee": 10, "time": 1_600_000_000}
        b.update(kw); return b

    def test_buy_eur_price_from_cost(self):
        r = kraken._map_trade("T1", self._t())
        assert r["type"] == "BUY" and r["symbol"] == "BTC"
        assert r["price_currency"] == "EUR"
        assert r["price_usd"] == pytest.approx(15000 / 0.5)  # cost/vol para quote não-USD

    def test_skip_stablecoin_base(self):
        assert kraken._map_trade("T2", self._t(pair="USDTZUSD")) is None

    def test_non_buysell_dropped(self):
        assert kraken._map_trade("T3", self._t(type="deposit")) is None

    def test_zero_vol_dropped(self):
        assert kraken._map_trade("T4", self._t(vol=0)) is None


# ─────────────────────────── Trading 212 ───────────────────────────
class TestT212MapOrder:
    def _o(self, **kw):
        b = {"status": "FILLED", "type": "MARKET_BUY", "filledQuantity": 3,
             "filledPrice": 150, "dateExecuted": "2026-01-05T10:00:00Z",
             "ticker": "AAPL_US_EQ", "currencyCode": "USD", "orderId": "o1",
             "instrumentName": "Apple"}
        b.update(kw); return b

    def test_filled_buy(self):
        r = trading212._map_order(self._o())
        assert r["type"] == "BUY" and r["symbol"] == "AAPL"   # sufixo _US_EQ removido
        assert r["asset_type"] == "stock" and r["date"] == "2026-01-05"

    def test_sell_side(self):
        assert trading212._map_order(self._o(type="LIMIT_SELL"))["type"] == "SELL"

    def test_unfilled_dropped(self):
        assert trading212._map_order(self._o(status="CANCELLED")) is None

    def test_zero_qty_dropped(self):
        assert trading212._map_order(self._o(filledQuantity=0, quantity=0)) is None


# ─────────────────────────── DEGIRO ───────────────────────────
class TestDegiro:
    def test_parse_date_dict(self):
        assert degiro._parse_date({"year": 2026, "month": 1, "day": 5}) == "2026-01-05"

    def test_parse_date_string(self):
        assert degiro._parse_date("2026-01-05T10:00:00") == "2026-01-05"

    def _t(self, **kw):
        b = {"buysell": "B", "quantity": 10, "price": 200,
             "totalFeesInBaseCurrency": 2, "currency": "EUR",
             "productSymbol": "AAPL", "productName": "Apple",
             "date": "2026-01-05", "id": 55}
        b.update(kw); return b

    def test_buy(self):
        r = degiro._map_transaction(self._t())
        assert r["type"] == "BUY" and r["symbol"] == "AAPL"
        assert r["asset_type"] == "stock" and r["fee_currency"] == "EUR"

    def test_sell(self):
        assert degiro._map_transaction(self._t(buysell="S"))["type"] == "SELL"

    def test_non_trade_dropped(self):
        assert degiro._map_transaction(self._t(buysell="")) is None

    def test_empty_symbol_dropped(self):
        # guarda de robustez adicionada (23 jul 2026)
        assert degiro._map_transaction(self._t(productSymbol="", symbol="")) is None

    def test_zero_qty_dropped(self):
        assert degiro._map_transaction(self._t(quantity=0)) is None


# ─────────────────────────── Coinbase ───────────────────────────
class TestCoinbaseMapFill:
    def _f(self, **kw):
        b = {"side": "BUY", "size": 0.5, "price": 40000, "product_id": "BTC-USD",
             "commission": 1.0, "trade_time": "2026-01-05T10:00:00Z", "trade_id": "c1"}
        b.update(kw); return b

    def test_buy(self):
        r = coinbase._map_fill(self._f())
        assert r["type"] == "BUY" and r["symbol"] == "BTC"
        assert r["price_currency"] == "USD" and r["date"] == "2026-01-05"

    def test_sell(self):
        assert coinbase._map_fill(self._f(side="sell"))["type"] == "SELL"

    def test_non_trade_dropped(self):
        assert coinbase._map_fill(self._f(side="")) is None

    def test_zero_qty_dropped(self):
        assert coinbase._map_fill(self._f(size=0, base_size=0, filled_size=0)) is None

    def test_product_without_quote_defaults_usd(self):
        r = coinbase._map_fill(self._f(product_id="ETH"))
        assert r["symbol"] == "ETH" and r["price_currency"] == "USD"

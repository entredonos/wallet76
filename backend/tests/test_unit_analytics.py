"""Testes unitários das métricas de análise (analytics._compute_metrics):
retorno total, CAGR (só com >= 1 ano de histórico), max drawdown, dias de
histórico e melhores/piores meses. Puro: recebe uma série e devolve um dict.
"""
import pytest

from routes.analytics import _compute_metrics


def _pt(ts, value, cost=0):
    return {"ts": ts, "value": value, "cost": cost}


class TestGuards:
    def test_empty_series(self):
        assert _compute_metrics([]) == {}

    def test_single_point(self):
        assert _compute_metrics([_pt("2026-01-01", 100)]) == {}


class TestTotalReturn:
    def test_simple_gain(self):
        m = _compute_metrics([_pt("2026-01-01", 100), _pt("2026-01-04", 150)])
        assert m["total_return_pct"] == 50.0

    def test_loss(self):
        m = _compute_metrics([_pt("2026-01-01", 200), _pt("2026-01-02", 150)])
        assert m["total_return_pct"] == -25.0

    def test_zero_start_guarded(self):
        m = _compute_metrics([_pt("2026-01-01", 0), _pt("2026-01-02", 100)])
        assert m["total_return_pct"] == 0


class TestCagr:
    def test_none_when_under_one_year(self):
        m = _compute_metrics([_pt("2026-01-01", 100), _pt("2026-03-01", 150)])
        assert m["cagr_pct"] is None

    def test_computed_when_over_one_year(self):
        m = _compute_metrics([_pt("2024-01-01", 100), _pt("2026-01-01", 200)])
        assert m["cagr_pct"] is not None
        # ~2 anos, duplicou -> ~41% ao ano
        assert 40.0 < m["cagr_pct"] < 43.0


class TestHistoryDaysAndDrawdown:
    def test_history_days(self):
        m = _compute_metrics([_pt("2026-01-01", 100), _pt("2026-01-11", 110)])
        assert m["history_days"] == 10

    def test_max_drawdown(self):
        # 100 -> 120 -> 90 -> 110 : queda máxima do pico 120 até 90 = 25%
        m = _compute_metrics([
            _pt("2026-01-01", 100), _pt("2026-01-02", 120),
            _pt("2026-01-03", 90), _pt("2026-01-04", 110),
        ])
        assert m["max_drawdown_pct"] == 25.0

    def test_no_drawdown_when_monotonic_up(self):
        m = _compute_metrics([_pt("2026-01-01", 100), _pt("2026-01-02", 150)])
        assert m["max_drawdown_pct"] == 0.0


class TestMonthlyReturns:
    def test_best_and_worst_month(self):
        m = _compute_metrics([
            _pt("2026-01-31", 100),
            _pt("2026-02-28", 110),   # +10% vs jan
            _pt("2026-03-31", 99),    # -10% vs fev
        ])
        assert m["best_month"]["month"] == "2026-02"
        assert m["best_month"]["pct"] == 10.0
        assert m["worst_month"]["month"] == "2026-03"
        assert m["worst_month"]["pct"] == -10.0
        assert len(m["months"]) == 2

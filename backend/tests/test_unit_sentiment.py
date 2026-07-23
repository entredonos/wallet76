"""Teste unitário do classificador do manómetro de sentimento
(routes/market.py::_classify_sentiment). Limites das 5 zonas Fear & Greed.

Importa o módulo de rotas (que puxa `core`); o conftest.py define env vars
placeholder para isso não rebentar sem .env real.
"""
import pytest

from routes.market import _classify_sentiment


@pytest.mark.parametrize("score,expected", [
    (0, "extreme_fear"),
    (24, "extreme_fear"),
    (25, "fear"),
    (44, "fear"),
    (45, "neutral"),
    (55, "neutral"),
    (56, "greed"),
    (74, "greed"),
    (75, "extreme_greed"),
    (100, "extreme_greed"),
])
def test_classify_sentiment_boundaries(score, expected):
    assert _classify_sentiment(score) == expected

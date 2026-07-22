"""XTB connector — xStation API (xAPI), SOMENTE LEITURA.

A XTB não oferece uma API key só de leitura: autentica-se por WebSocket com o
userId + password da conta. Por isso NUNCA enviamos comandos de negociação —
só lemos: login -> getAllSymbols (classificação/moeda) -> getTrades (posições
abertas) + getTradesHistory (fechadas) -> logout. Nenhum tradeTransaction é
alguma vez enviado.

WebSocket: wss://ws.xtb.com/real  (demo: wss://ws.xtb.com/demo)
Docs: http://developers.xstore.pro/documentation/

Só importamos ações, ETFs e cripto (categorias STC/ETF/CRT). CFDs de índices,
forex e commodities (IND/FX/CMD) são ignorados — não correspondem a ativos com
cotação no Wallet76.
"""
import asyncio
import json
from datetime import date

import websockets

WS_REAL = "wss://ws.xtb.com/real"
WS_DEMO = "wss://ws.xtb.com/demo"

_TIMEOUT = 30

# Categorias XTB que importamos e respetivo asset_type interno.
_STOCK_CATS = {"STC", "ETF"}
_CRYPTO_CATS = {"CRT"}

# cmd XTB: 0 buy, 1 sell, 2 buy_limit, 3 sell_limit, 4 buy_stop, 5 sell_stop,
# 6 balance, 7 credit. Só posições (0/1) interessam.
_BUY_CMDS = {0, 2, 4}
_SELL_CMDS = {1, 3, 5}

# Nomes de cripto CFD da XTB -> símbolo padrão.
_CRYPTO_NAME_MAP = {
    "BITCOIN": "BTC", "ETHEREUM": "ETH", "RIPPLE": "XRP", "LITECOIN": "LTC",
    "DASH": "DASH", "STELLAR": "XLM", "CARDANO": "ADA", "POLKADOT": "DOT",
    "DOGECOIN": "DOGE", "SOLANA": "SOL", "TRON": "TRX", "POLYGON": "MATIC",
}


class XTBError(Exception):
    pass


def _clean_symbol(sym: str, is_crypto: bool) -> str:
    """Traduz o ticker da XTB para o formato do fornecedor de preços."""
    s = (sym or "").upper().strip()
    if is_crypto:
        base = s.split(".")[0]
        return _CRYPTO_NAME_MAP.get(base, base)
    # Sufixos de mercado -> convenção Yahoo Finance
    suffix_map = {
        ".US": "", ".US_9": "", ".US_4": "",
        ".UK": ".L", ".DE": ".DE", ".FR": ".PA", ".NL": ".AS",
        ".ES": ".MC", ".IT": ".MI", ".PL": ".WA", ".CH": ".SW",
        ".PT": ".LS", ".BE": ".BR", ".SE": ".ST", ".NO": ".OL",
        ".FI": ".HE", ".DK": ".CO",
    }
    for suf, repl in suffix_map.items():
        if s.endswith(suf):
            return s[: -len(suf)] + repl
    return s


async def _cmd(ws, command: str, arguments: dict | None = None):
    payload = {"command": command}
    if arguments:
        payload["arguments"] = arguments
    await ws.send(json.dumps(payload))
    raw = await asyncio.wait_for(ws.recv(), timeout=_TIMEOUT)
    data = json.loads(raw)
    if not data.get("status"):
        err = data.get("errorDescr") or data.get("errorCode") or "unknown error"
        raise XTBError(f"XTB {command}: {err}")
    return data.get("returnData")


async def _connect_and_login(user_id: str, password: str, demo: bool = False):
    url = WS_DEMO if demo else WS_REAL
    ws = await asyncio.wait_for(websockets.connect(url, max_size=None), timeout=_TIMEOUT)
    try:
        await _cmd(ws, "login", {"userId": user_id, "password": password})
    except Exception:
        await ws.close()
        raise
    return ws


async def validate_credentials(user_id: str, password: str, demo: bool = False) -> bool:
    try:
        ws = await _connect_and_login(user_id, password, demo)
        try:
            await _cmd(ws, "logout")
        except Exception:
            pass
        await ws.close()
        return True
    except Exception:
        return False


def _leg(symbol_clean, asset_type, ttype, price, ts_ms, qty, currency, fee, raw_sym, position, tag):
    d = date.fromtimestamp(ts_ms / 1000).isoformat() if ts_ms else date.today().isoformat()
    return {
        "symbol": symbol_clean,
        "name": symbol_clean,
        "asset_type": asset_type,
        "type": ttype,
        "date": d,
        "quantity": abs(float(qty)),
        # preço na moeda nativa do instrumento; _import_transactions converte
        "price_usd": abs(float(price)),
        "price_currency": currency,
        "fee": abs(float(fee or 0)),
        "fee_currency": currency,
        "notes": f"XTB import · {raw_sym} · pos {position}",
        "_broker_id": f"xtb_{tag}_{position}",
        "_broker": "xtb",
    }


async def fetch_transactions(user_id: str, password: str, demo: bool = False) -> list[dict]:
    ws = await _connect_and_login(user_id, password, demo)
    out: list[dict] = []
    try:
        # Mapa símbolo -> (categoria, moeda) para classificar e saber a moeda.
        cats, currencies = {}, {}
        try:
            syms = await _cmd(ws, "getAllSymbols") or []
            for srec in syms:
                nm = srec.get("symbol")
                if nm:
                    cats[nm] = (srec.get("categoryName") or "").upper()
                    currencies[nm] = (srec.get("currency") or "USD").upper()
        except Exception:
            pass

        def classify(raw_sym):
            cat = cats.get(raw_sym, "")
            if cat in _CRYPTO_CATS:
                return "crypto"
            if cat in _STOCK_CATS:
                return "stock"
            return None  # FX/IND/CMD/desconhecido -> ignorar

        def handle(rec, from_history):
            raw_sym = rec.get("symbol") or ""
            if not raw_sym:
                return
            asset_type = classify(raw_sym)
            if asset_type is None:
                return
            cmd = int(rec.get("cmd", 0))
            if cmd in _BUY_CMDS:
                open_side, close_side = "BUY", "SELL"
            elif cmd in _SELL_CMDS:
                open_side, close_side = "SELL", "BUY"
            else:
                return  # balance/credit
            vol = float(rec.get("volume") or 0)
            open_price = float(rec.get("open_price") or 0)
            if vol == 0 or open_price == 0:
                return
            currency = currencies.get(raw_sym, "USD")
            position = rec.get("position") or rec.get("order") or ""
            is_crypto = asset_type == "crypto"
            sym_clean = _clean_symbol(raw_sym, is_crypto)
            # Perna de abertura — mesmo _broker_id quer venha de getTrades quer
            # de getTradesHistory, para não duplicar quando a posição fecha.
            out.append(_leg(sym_clean, asset_type, open_side, open_price,
                            rec.get("open_time"), vol, currency,
                            rec.get("commission"), raw_sym, position, "open"))
            # Perna de fecho — só para trades já fechadas no histórico.
            if from_history and rec.get("close_time"):
                close_price = float(rec.get("close_price") or 0)
                if close_price > 0:
                    out.append(_leg(sym_clean, asset_type, close_side, close_price,
                                    rec.get("close_time"), vol, currency,
                                    0, raw_sym, position, "close"))

        # Posições abertas (holdings atuais)
        try:
            opened = await _cmd(ws, "getTrades", {"openedOnly": True}) or []
            for rec in opened:
                handle(rec, from_history=False)
        except Exception:
            pass

        # Histórico de trades fechadas (start=0 -> desde sempre; end=0 -> agora)
        try:
            hist = await _cmd(ws, "getTradesHistory", {"start": 0, "end": 0}) or []
            for rec in hist:
                handle(rec, from_history=True)
        except Exception:
            pass

        try:
            await _cmd(ws, "logout")
        except Exception:
            pass
    finally:
        await ws.close()

    return out

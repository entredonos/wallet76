"""Interactive Brokers Flex Query connector (official read-only API).

Setup (user does this once in IB Web Portal):
  1. Reports → Flex Queries → Create *Activity* Flex Query
  2. Enable the "Open Positions" section (Symbol, AssetCategory, Position,
     CostBasisPrice, Currency) — this gives current holdings regardless of
     when they were bought. Optionally also enable "Trades" (used as a
     fallback if no Open Positions section is present).
  3. Format: XML
  4. Save → note the Query ID
  5. Manage Flex Queries → Create Token → note the Token

We store: encrypted token + query_id (plain, not sensitive).
"""
import asyncio
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any

import httpx

BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
HEADERS = {"User-Agent": "Mozilla/5.0"}


class IBKRError(Exception):
    pass


class IBKRNotReady(IBKRError):
    """IBKR respondeu, mas o extrato ainda não está pronto — token/consulta
    acabados de criar (ainda a propagar), geração em curso, ou limite de
    frequência. As credenciais são plausivelmente válidas; vale a pena tentar
    de novo daqui a pouco."""
    pass


# Erros TRANSITÓRIOS do IBKR: o relatório ainda não está pronto ou estamos a
# ser limitados por frequência. Vale a pena voltar a tentar automaticamente em
# vez de falhar a sincronização toda. Um token/consulta acabados de criar
# também podem demorar (até ~1h) a propagar.
_TRANSIENT_HINTS = (
    "generated at this time",     # "Statement could not be generated at this time"
    "try again",
    "generation in progress",
    "too many requests",
    "not ready",
    "please wait",
    "could not be retrieved",
    "1018",   # too many requests / rate limit
    "1019",   # statement generation in progress
    "1021",   # statement could not be retrieved at this point
)

# Mensagem amigável quando esgotamos as tentativas por o relatório não estar
# pronto (o caso típico logo a seguir a criar o token/consulta).
_NOT_READY_MSG = (
    "O IBKR ainda está a preparar o relatório e não o conseguiu gerar. É "
    "normal logo depois de criar o token/consulta (pode demorar até ~1h a "
    "ficar ativo). Tenta sincronizar de novo dentro de alguns minutos."
)


def _is_transient(msg: str) -> bool:
    m = (msg or "").lower()
    return any(h in m for h in _TRANSIENT_HINTS)


async def _request_statement(token: str, query_id: str) -> str:
    """Step 1: request statement generation, returns reference code.

    Tenta de novo automaticamente nos erros transitórios do IBKR ("ainda não
    pronto" / limite de frequência) com backoff exponencial, para uma
    sincronização não falhar só porque o relatório não estava pronto no
    instante em que pedimos. Falha já nos erros permanentes (token inválido/
    expirado, query id errado)."""
    last_err = "Unknown error"
    for delay in (0, 3, 6, 12):  # 4 tentativas, ~21s no pior caso
        if delay:
            await asyncio.sleep(delay)
        async with httpx.AsyncClient(headers=HEADERS, timeout=20) as client:
            r = await client.get(
                f"{BASE}.SendRequest",
                params={"t": token, "q": query_id, "v": "3"},
            )
            r.raise_for_status()
        try:
            root = ET.fromstring(r.text)
        except ET.ParseError:
            last_err = "Invalid response from IBKR"
            continue
        if root.findtext("Status") == "Success":
            ref = root.findtext("ReferenceCode")
            if not ref:
                raise IBKRError("No ReferenceCode in IB response")
            return ref
        last_err = root.findtext("ErrorMessage") or root.findtext("ErrorCode") or "Unknown error"
        if not _is_transient(last_err):
            raise IBKRError(f"IB Flex request failed: {last_err}")
        # transitório — continua o ciclo e tenta de novo após o backoff
    raise IBKRNotReady(f"{_NOT_READY_MSG} (IBKR: {last_err})")


async def _get_statement(token: str, ref: str) -> str:
    """Step 2: poll until statement is ready (usually <5s), return XML."""
    last_err = ""
    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        for attempt in range(10):
            await asyncio.sleep(2 * (attempt + 1))
            r = await client.get(
                f"{BASE}.GetStatement",
                params={"t": token, "q": ref, "v": "3"},
            )
            r.raise_for_status()
            if "<FlexQueryResponse" in r.text:
                return r.text
            # Ainda a gerar — distingue "não pronto" (continua) de erro real.
            try:
                root = ET.fromstring(r.text)
                last_err = root.findtext("ErrorMessage") or ""
                if last_err and not _is_transient(last_err):
                    raise IBKRError(f"IB Flex error: {last_err}")
            except ET.ParseError:
                pass

    raise IBKRNotReady(_NOT_READY_MSG + (f" (IBKR: {last_err})" if last_err else ""))


def _norm_date(raw: str) -> str:
    """Datas IB: 'YYYYMMDD', 'YYYY-MM-DD' ou 'YYYYMMDD;HHMMSS' -> 'YYYY-MM-DD'."""
    if not raw:
        return ""
    raw = raw.split(";")[0].split(" ")[0].strip()
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    return raw[:10]


def _parse_positions(root) -> list[dict]:
    """Modo fotografia: le <OpenPosition> = o que a conta tem AGORA,
    independentemente de quando foi comprado. Uma compra sintetica por
    posicao, ao custo medio da propria IBKR. _broker_id estavel por simbolo
    para cada sync refrescar a fotografia (o sync substitui as linhas IBKR)."""
    out = []
    for pos in root.iter("OpenPosition"):
        if pos.get("assetCategory", "") not in ("STK", "ETF"):
            continue  # acoes/ETFs; ignora forex (CASH), futuros e opcoes
        symbol = (pos.get("symbol") or "").upper().strip()
        qty = float(pos.get("position") or 0)      # com sinal; longo > 0
        cost_price = abs(float(pos.get("costBasisPrice") or 0))
        if not symbol or qty <= 0 or cost_price <= 0:
            continue  # sem shorts, sem posicoes a zero, sem preco -> ignora
        currency = pos.get("currency") or "USD"
        open_date = _norm_date(pos.get("holdingPeriodDateTime")
                               or pos.get("openDateTime") or "")
        out.append({
            "symbol": symbol,
            "name": pos.get("description") or symbol,
            "asset_type": "stock",
            "type": "BUY",
            "date": open_date or "2000-01-01",
            "quantity": qty,
            "price_usd": cost_price,
            "price_currency": currency,
            "fee": 0.0,
            "fee_currency": currency,
            "notes": "IBKR — posicao atual (custo medio)",
            "_broker_id": f"pos-{symbol}",
            "_broker": "ibkr",
            "_snapshot": True,
        })
    return out


def _parse_trades(root) -> list[dict]:
    """Fallback: reconstroi a partir de <Trade> (compras/vendas dentro do
    periodo da Flex Query). So usado quando a query nao tem a seccao de
    Open Positions."""
    results = []
    for trade in root.iter("Trade"):
        asset_cat = trade.get("assetCategory", "")
        if asset_cat not in ("STK", "ETF", "FUT", "OPT"):
            continue   # skip bonds, cash, etc.

        buy_sell = trade.get("buySell", "")
        if buy_sell not in ("BUY", "SELL"):
            continue

        symbol = (trade.get("symbol") or "").upper().strip()
        qty = abs(float(trade.get("quantity") or 0))
        price = abs(float(trade.get("tradePrice") or 0))
        commission = abs(float(trade.get("ibCommission") or 0))
        currency = trade.get("currency") or "USD"
        trade_date = _norm_date(trade.get("tradeDate") or "")

        if not symbol or qty == 0:
            continue

        results.append({
            "symbol": symbol,
            "name": trade.get("description") or symbol,
            "asset_type": "stock",
            "type": buy_sell,
            "date": trade_date,
            "quantity": qty,
            "price_usd": price,
            "price_currency": currency,
            "fee": commission,
            "fee_currency": currency,
            "notes": f"IBKR import · {trade.get('tradeID', '')}",
            "_broker_id": trade.get("tradeID") or "",
            "_broker": "ibkr",
        })

    return results


def _parse_xml(xml_text: str) -> list[dict]:
    """Parse IB Flex XML. Prefere Open Positions (posicoes atuais exatas,
    incl. lotes comprados antes do periodo da query); recorre aos Trades
    quando a query nao tem a seccao de Open Positions."""
    root = ET.fromstring(xml_text)
    positions = _parse_positions(root)
    if positions:
        return positions
    return _parse_trades(root)


async def fetch_transactions(token: str, query_id: str) -> list[dict]:
    """Full flow: request → poll → parse."""
    ref = await _request_statement(token, query_id)
    xml_text = await _get_statement(token, ref)
    return _parse_xml(xml_text)


async def validate_credentials(token: str, query_id: str) -> bool:
    try:
        ref = await _request_statement(token, query_id)
        return bool(ref)
    except IBKRNotReady:
        # O IBKR aceitou as credenciais — só o relatório é que ainda não está
        # pronto. Deixamos ligar na mesma; a sincronização apanha os dados
        # quando estiver disponível, em vez de bloquear a ligação até lá.
        return True
    except IBKRError:
        return False

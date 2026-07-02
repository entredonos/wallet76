"""Reset + seed de dados de teste (Task #47).

Apaga TODAS as transações e snapshots do utilizador indicado (mantém as
carteiras existentes) e insere um conjunto novo de transações de teste,
espalhadas por várias datas, para testar os gráficos (intraday, diário,
semanal, ALL) com dados previsíveis.

Os PREÇOS usados nas transações são aproximações — servem só de base de
custo (P&L), o valor atual da carteira continua a vir sempre dos preços
em tempo real (CoinGecko/Yahoo), como em qualquer transação real.

Uso (a partir da pasta backend/, com o venv do backend ativo):

    python scripts/reset_test_data.py
    python scripts/reset_test_data.py outro_email@exemplo.com

Sem argumentos, usa o email entredonos@gmail.com.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import os

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Ativos de teste: mix cripto + ações/ETF, com várias compras/vendas
# espalhadas por ~13 meses, para cobrir bem 1D/1W/1M/1Y/ALL e ainda dar
# holdings atuais > 0 para os ranges intraday (15m/30m/1h/4h).
TEST_TXNS = [
    # BTC
    dict(asset_type="crypto", symbol="BTC", coingecko_id="bitcoin", name="Bitcoin",
         type="BUY", date="2025-06-01", quantity=0.05, price=68000, fee=5),
    dict(asset_type="crypto", symbol="BTC", coingecko_id="bitcoin", name="Bitcoin",
         type="BUY", date="2025-11-15", quantity=0.03, price=91000, fee=5),
    dict(asset_type="crypto", symbol="BTC", coingecko_id="bitcoin", name="Bitcoin",
         type="BUY", date="2026-06-25", quantity=0.02, price=105000, fee=5),
    # ETH
    dict(asset_type="crypto", symbol="ETH", coingecko_id="ethereum", name="Ethereum",
         type="BUY", date="2025-07-10", quantity=1.5, price=3400, fee=3),
    dict(asset_type="crypto", symbol="ETH", coingecko_id="ethereum", name="Ethereum",
         type="BUY", date="2026-02-01", quantity=1.0, price=3800, fee=3),
    # SOL (com uma venda parcial, para testar quantidade a mudar ao longo do tempo)
    dict(asset_type="crypto", symbol="SOL", coingecko_id="solana", name="Solana",
         type="BUY", date="2025-09-05", quantity=20, price=145, fee=2),
    dict(asset_type="crypto", symbol="SOL", coingecko_id="solana", name="Solana",
         type="SELL", date="2026-03-01", quantity=5, price=175, fee=2),
    # AAPL
    dict(asset_type="stock", symbol="AAPL", coingecko_id=None, name="Apple Inc.",
         type="BUY", date="2025-05-20", quantity=10, price=195, fee=1),
    dict(asset_type="stock", symbol="AAPL", coingecko_id=None, name="Apple Inc.",
         type="BUY", date="2025-12-10", quantity=5, price=225, fee=1),
    # MSFT
    dict(asset_type="stock", symbol="MSFT", coingecko_id=None, name="Microsoft Corp.",
         type="BUY", date="2025-08-15", quantity=8, price=420, fee=1),
    # SPY (ETF)
    dict(asset_type="etf", symbol="SPY", coingecko_id=None, name="SPDR S&P 500 ETF",
         type="BUY", date="2025-06-01", quantity=6, price=530, fee=1),
    dict(asset_type="etf", symbol="SPY", coingecko_id=None, name="SPDR S&P 500 ETF",
         type="BUY", date="2026-06-20", quantity=4, price=560, fee=1),
]


async def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "entredonos@gmail.com"

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    user = await db.users.find_one({"email": email})
    if not user:
        print(f"Utilizador não encontrado: {email}")
        return
    user_id = user["id"]
    print(f"Utilizador: {email} (id={user_id})")

    wallets = await db.wallets.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    if not wallets:
        wallet_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": "Teste",
            "type": "broker",
            "currency": "USD",
            "icon": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.wallets.insert_one(wallet_doc)
        wallets = [wallet_doc]
        print("Nenhuma carteira existia — criada carteira 'Teste'.")
    else:
        print(f"{len(wallets)} carteira(s) existente(s): {[w['name'] for w in wallets]}")

    # --- Reset: apaga transações e snapshots (mantém carteiras) ---
    del_txns = await db.transactions.delete_many({"user_id": user_id})
    del_snaps = await db.snapshots.delete_many({"user_id": user_id})
    print(f"Apagadas {del_txns.deleted_count} transações e {del_snaps.deleted_count} snapshots.")

    # --- Seed: novas transações de teste, distribuídas pelas carteiras existentes ---
    docs = []
    for i, t in enumerate(TEST_TXNS):
        wallet = wallets[i % len(wallets)]
        docs.append({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet_id": wallet["id"],
            "asset_type": t["asset_type"],
            "symbol": t["symbol"],
            "coingecko_id": t["coingecko_id"],
            "name": t["name"],
            "type": t["type"],
            "date": t["date"],
            "quantity": t["quantity"],
            "price": t["price"],
            "fee": t["fee"],
            "currency": "USD",
            "fx_to_usd": 1.0,
            "notes": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.transactions.insert_many(docs)
    print(f"Inseridas {len(docs)} transações de teste.")

    print("\nAtivos: BTC, ETH, SOL (cripto) + AAPL, MSFT, SPY (ações/ETF).")
    print("Feito. Abre a app — o próximo GET /portfolio já grava um snapshot novo.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())

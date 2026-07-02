"""Quick admin tools to inspect / clean test users.

Usage (dentro de /app/backend):
    python3 admin_tools.py list                       # lista todos os utilizadores
    python3 admin_tools.py list unverified            # lista só os não verificados
    python3 admin_tools.py delete <email>             # apaga um utilizador (e dados)
    python3 admin_tools.py delete-unverified          # apaga TODOS não verificados
    python3 admin_tools.py reset-cache                # esvazia a cache em memória (reinicia backend)
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import os
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def list_users(only_unverified: bool = False):
    q = {"email_verified": {"$ne": True}} if only_unverified else {}
    cursor = db.users.find(q, {"_id": 0, "email": 1, "name": 1, "email_verified": 1, "created_at": 1})
    rows = await cursor.to_list(1000)
    if not rows:
        print("(nenhum utilizador)")
        return
    print(f"{'EMAIL':<40} {'VERIFIED':<10} {'NAME':<20} CREATED")
    print("-" * 100)
    for u in rows:
        print(
            f"{u.get('email',''):<40} "
            f"{'✓' if u.get('email_verified') else '✗':<10} "
            f"{(u.get('name') or '—')[:18]:<20} "
            f"{(u.get('created_at') or '—')[:19]}"
        )
    print(f"\n{len(rows)} utilizador(es).")


async def delete_user(email: str):
    email = email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        print(f"Utilizador não encontrado: {email}")
        return
    uid = user["id"]
    counts = {}
    for coll in ("wallets", "transactions", "assets", "alerts", "watchlists",
                 "watchlist_groups", "snapshots", "user_prefs", "user_security"):
        r = await db[coll].delete_many({"user_id": uid})
        counts[coll] = r.deleted_count
    await db.users.delete_one({"id": uid})
    print(f"✓ Eliminado {email} (uid={uid})")
    for k, v in counts.items():
        if v:
            print(f"   - {k}: {v}")


async def delete_unverified():
    cursor = db.users.find({"email_verified": {"$ne": True}}, {"email": 1, "_id": 0})
    emails = [u["email"] for u in await cursor.to_list(1000)]
    if not emails:
        print("(nenhum utilizador não verificado)")
        return
    print(f"A apagar {len(emails)} utilizadores não verificados:")
    for em in emails:
        await delete_user(em)
    print(f"\n✓ {len(emails)} utilizador(es) não verificado(s) eliminados.")


def reset_cache():
    """A cache é só em memória; basta reiniciar o backend."""
    import subprocess
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False)
    print("✓ Backend reiniciado — cache em memória limpa.")

async def promote_user(email: str):
    res = await db.users.update_one(
        {"email": email.lower()},
        {
            "$set": {
                "role": "admin",
                "subscription_status": "active",
                "subscription_plan": "admin"
            }
        }
    )

    if res.matched_count == 0:
        print(f"Utilizador não encontrado: {email}")
    else:
        print(f"Admin ativado para: {email}")
        
async def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "list":
        await list_users(only_unverified=(len(args) > 1 and args[1] == "unverified"))
    elif cmd == "delete" and len(args) >= 2:
        await delete_user(args[1])
    elif cmd == "delete-unverified":
        await delete_unverified()
    elif cmd == "reset-cache":
        reset_cache()
    elif cmd == "promote" and len(args) >= 2:
        await promote_user(args[1])
    else:
        print(__doc__)

if __name__ == "__main__":
    if sys.argv[1:2] == ["reset-cache"]:
        reset_cache()
    else:
        asyncio.run(main())

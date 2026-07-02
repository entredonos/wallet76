import asyncio
from core import db

async def main():
    users = await db.snapshots.distinct("user_id")
    deleted = 0

    for user_id in users:
        snaps = await db.snapshots.find(
            {"user_id": user_id},
            {"_id": 0}
        ).sort("bucket_ts", 1).to_list(20000)

        for i in range(1, len(snaps) - 1):
            prev = float(snaps[i - 1].get("total_usd") or 0)
            cur = float(snaps[i].get("total_usd") or 0)
            nxt = float(snaps[i + 1].get("total_usd") or 0)

            if prev <= 0 or cur <= 0 or nxt <= 0:
                continue

            # Apaga quedas isoladas falsas:
            # exemplo 440K -> 150K -> 440K
            bad_isolated_drop = (
                cur < prev * 0.60 and
                nxt > prev * 0.80
            )

            # Apaga subidas isoladas falsas:
            # exemplo 100K -> 900K -> 100K
            bad_isolated_spike = (
                cur > prev * 3 and
                nxt < cur * 0.50
            )

            if bad_isolated_drop or bad_isolated_spike:
                await db.snapshots.delete_one({
                    "user_id": snaps[i]["user_id"],
                    "bucket_ts": snaps[i]["bucket_ts"],
                })
                print(f"Deleted bad snapshot: {snaps[i]['bucket_ts']} {prev:.2f} -> {cur:.2f} -> {nxt:.2f}")
                deleted += 1

    print(f"Done. Deleted {deleted} bad snapshots.")

asyncio.run(main())
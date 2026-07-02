"""Cleanup script for historically-invalid portfolio snapshots.

Some snapshots in the DB predate the data-quality guards that now exist in
_save_snapshot() (routes/portfolio.py) — e.g. the false "-100%" drop bug
fixed under task #36, or isolated bad price fetches that briefly made a
single 15-min bucket wildly wrong. Those old bad points still distort the
Dashboard's Evolução chart (and the "rede de segurança" fallback in
_build_retro_history_intraday, which reads real snapshots) even though new
writes are now guarded against it.

This finds and removes:
  1. Snapshots with total_usd <= 0 (never valid — a real portfolio worth $0
     with active holdings can't happen; guarded at write time since task
     #36, but older rows may predate that).
  2. Isolated V-shaped drops:  prev -> cur (cur < 60% of prev) -> next (back
     up to >= 80% of prev) — a single bad bucket sandwiched between two
     normal ones.
  3. Isolated spikes: prev -> cur (cur > 3x prev) -> next (back down to
     <= 50% of cur) — the inverse pattern.
  4. Exact duplicate bucket_ts per user (upsert in _save_snapshot prevents
     these going forward, but older rows written before that existed, or a
     migration re-run, could have left dupes) — keeps the most recently
     modified copy.

Thresholds for #2/#3 intentionally match the "isolated point" spirit of
_drop_price_spikes() elsewhere in the codebase: real market moves rarely
look like a single-bucket needle that fully reverts one bucket later.

Usage:
    python clean_snapshots.py            # dry run — reports what WOULD be deleted
    python clean_snapshots.py --apply    # actually deletes
    python clean_snapshots.py --apply --user-id <id>   # limit to one user
"""
import argparse
import asyncio
from collections import defaultdict

from core import db


async def main(apply: bool, only_user_id: str | None):
    users = [only_user_id] if only_user_id else await db.snapshots.distinct("user_id")

    counts = defaultdict(int)
    to_delete = []  # list of (user_id, bucket_ts, reason)

    for user_id in users:
        snaps = await db.snapshots.find(
            {"user_id": user_id},
            {"_id": 0},
        ).sort("bucket_ts", 1).to_list(20000)

        # -- Pass 1: exact duplicate bucket_ts (keep the last one seen) --
        seen_ts = {}
        for s in snaps:
            ts = s.get("bucket_ts")
            if not ts:
                continue
            if ts in seen_ts:
                to_delete.append((user_id, ts, "duplicate_bucket_ts"))
                counts["duplicate_bucket_ts"] += 1
            seen_ts[ts] = s

        # Dedupe the working list itself so passes 2/3 don't re-flag the
        # same bucket_ts twice via stale duplicate entries.
        snaps = list(seen_ts.values())
        snaps.sort(key=lambda s: s.get("bucket_ts") or "")

        # -- Pass 2: non-positive total_usd --
        for s in snaps:
            total = float(s.get("total_usd") or 0)
            if total <= 0:
                to_delete.append((user_id, s["bucket_ts"], "non_positive_total"))
                counts["non_positive_total"] += 1

        # Only consider positive-total snapshots for the isolated-outlier
        # checks below, otherwise a just-flagged non_positive_total point
        # would also trip the isolated-drop/spike heuristics as a neighbor.
        positive_snaps = [s for s in snaps if float(s.get("total_usd") or 0) > 0]

        # -- Pass 3: isolated drop/spike (same heuristic as before) --
        for i in range(1, len(positive_snaps) - 1):
            prev = float(positive_snaps[i - 1]["total_usd"])
            cur = float(positive_snaps[i]["total_usd"])
            nxt = float(positive_snaps[i + 1]["total_usd"])

            bad_isolated_drop = cur < prev * 0.60 and nxt > prev * 0.80
            bad_isolated_spike = cur > prev * 3 and nxt < cur * 0.50

            if bad_isolated_drop:
                to_delete.append((user_id, positive_snaps[i]["bucket_ts"], "isolated_drop"))
                counts["isolated_drop"] += 1
                print(f"  [{user_id}] isolated_drop: {prev:.2f} -> {cur:.2f} -> {nxt:.2f} @ {positive_snaps[i]['bucket_ts']}")
            elif bad_isolated_spike:
                to_delete.append((user_id, positive_snaps[i]["bucket_ts"], "isolated_spike"))
                counts["isolated_spike"] += 1
                print(f"  [{user_id}] isolated_spike: {prev:.2f} -> {cur:.2f} -> {nxt:.2f} @ {positive_snaps[i]['bucket_ts']}")

    total = len(to_delete)
    print("\n--- Summary ---")
    for reason, n in counts.items():
        print(f"  {reason}: {n}")
    print(f"  TOTAL: {total} snapshot(s) {'deleted' if apply else 'would be deleted (dry run)'}")

    if not apply:
        print("\nRun with --apply to actually delete these.")
        return

    deleted = 0
    for user_id, bucket_ts, _reason in to_delete:
        res = await db.snapshots.delete_one({"user_id": user_id, "bucket_ts": bucket_ts})
        deleted += res.deleted_count
    print(f"Done. Deleted {deleted} snapshot(s).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually delete (default is dry run).")
    parser.add_argument("--user-id", default=None, help="Limit cleanup to a single user id.")
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply, only_user_id=args.user_id))

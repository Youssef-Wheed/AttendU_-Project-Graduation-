"""
One-time, idempotent backfill of Absent attendance rows for closed sessions.

Run from the ``src`` directory:

    python -m scripts.backfill_absent_events            # dry run (default)
    python -m scripts.backfill_absent_events --execute  # apply

The script reuses the same helper as the live close/stop flow. It only inserts
rows for enrolled students that have no event in a closed session and relies on
``ON CONFLICT (student_id, attendance_session_id) DO NOTHING`` so it can be run
more than once safely.
"""

import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import or_, select

from helpers.attendance_stats import insert_absent_events
from helpers.database import AsyncSessionLocal, engine
from Models import AttendanceSession


async def run(execute: bool) -> None:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        sessions = list(
            (
                await db.scalars(
                    select(AttendanceSession).where(
                        or_(
                            AttendanceSession.is_active.is_(False),
                            AttendanceSession.end_time <= now,
                        )
                    )
                )
            ).all()
        )

        print(f"Closed sessions found: {len(sessions)}")
        if not execute:
            print("Dry run only. Re-run with --execute to insert Absent rows.")
            return

        inserted = 0
        for session in sessions:
            inserted += await insert_absent_events(
                db,
                session_id=session.id,
                section_id=session.section_id,
            )
        await db.commit()
        print(f"Absent rows inserted (students without an event): {inserted}")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Absent attendance rows for closed sessions."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually write rows. Without this flag the script only reports.",
    )
    args = parser.parse_args()
    asyncio.run(run(execute=args.execute))


if __name__ == "__main__":
    main()

"""
Shared attendance statistics helpers.

Every attendance percentage shown by the API is derived from the functions in
this module so the admin student list, the course student list, the reports and
the session history stay consistent with each other.

Definitions:
  * An "ended" session is one with ``is_active = false`` or ``end_time <= now``.
  * A student "attended" an ended session when they have an attendance event in
    that session whose ``final_status`` is either ``Present`` or ``Late``.
  * ``percentage`` is ``attended / total * 100`` rounded to one decimal place
    and is ``0.0`` when there are no ended sessions.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from Models import AttendanceEvent, AttendanceSession, Device, Enrollment

ATTENDED_STATUSES = ("Present", "Late")


def ended_session_condition(now: datetime | None = None):
    """SQL condition matching sessions whose attendance window is over."""
    current_time = now or datetime.now(timezone.utc)
    return or_(
        AttendanceSession.is_active.is_(False),
        AttendanceSession.end_time <= current_time,
    )


def compute_percentage(attended: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((attended / total) * 100, 1)


async def get_student_attendance_stats(
    db: AsyncSession,
    student_ids: list[UUID],
    *,
    section_ids: list[UUID] | None = None,
    now: datetime | None = None,
) -> dict[UUID, dict]:
    """
    Return ``{student_id: {attended, total, percentage}}``.

    ``section_ids`` optionally restricts the sessions considered (used by the
    course student page so it only counts sessions in that course).
    """
    if not student_ids:
        return {}

    current_time = now or datetime.now(timezone.utc)
    ended_condition = ended_session_condition(current_time)

    total_stmt = (
        select(
            Enrollment.student_id.label("student_id"),
            func.count(func.distinct(AttendanceSession.id)).label("total"),
        )
        .join(AttendanceSession, AttendanceSession.section_id == Enrollment.section_id)
        .where(
            Enrollment.student_id.in_(student_ids),
            ended_condition,
        )
    )
    if section_ids is not None:
        if not section_ids:
            return {
                student_id: {"attended": 0, "total": 0, "percentage": 0.0}
                for student_id in student_ids
            }
        total_stmt = total_stmt.where(Enrollment.section_id.in_(section_ids))
    total_stmt = total_stmt.group_by(Enrollment.student_id)

    attended_events = (
        select(
            AttendanceEvent.student_id.label("student_id"),
            AttendanceEvent.attendance_session_id.label("session_id"),
        )
        .where(AttendanceEvent.final_status.in_(ATTENDED_STATUSES))
        .distinct()
        .subquery()
    )

    attended_stmt = (
        select(
            Enrollment.student_id.label("student_id"),
            func.count(func.distinct(AttendanceSession.id)).label("attended"),
        )
        .join(AttendanceSession, AttendanceSession.section_id == Enrollment.section_id)
        .join(
            attended_events,
            and_(
                attended_events.c.student_id == Enrollment.student_id,
                attended_events.c.session_id == AttendanceSession.id,
            ),
        )
        .where(
            Enrollment.student_id.in_(student_ids),
            ended_condition,
        )
    )
    if section_ids is not None:
        attended_stmt = attended_stmt.where(Enrollment.section_id.in_(section_ids))
    attended_stmt = attended_stmt.group_by(Enrollment.student_id)

    totals = {
        row.student_id: int(row.total)
        for row in (await db.execute(total_stmt)).all()
    }
    attended = {
        row.student_id: int(row.attended)
        for row in (await db.execute(attended_stmt)).all()
    }

    stats: dict[UUID, dict] = {}
    for student_id in student_ids:
        total = totals.get(student_id, 0)
        attended_count = attended.get(student_id, 0)
        stats[student_id] = {
            "attended": attended_count,
            "total": total,
            "percentage": compute_percentage(attended_count, total),
        }
    return stats


async def get_session_attendance_stats(
    db: AsyncSession,
    session_ids: list[UUID],
) -> dict[UUID, dict]:
    """
    Return ``{session_id: {present_count, total_students, attendance_percentage}}``.

    ``present_count`` counts distinct students with a Present/Late event in the
    session. ``total_students`` is the number of students currently enrolled in
    the session's section.
    """
    if not session_ids:
        return {}

    present_subquery = (
        select(
            AttendanceEvent.attendance_session_id.label("session_id"),
            func.count(func.distinct(AttendanceEvent.student_id)).label(
                "present_count"
            ),
        )
        .where(AttendanceEvent.final_status.in_(ATTENDED_STATUSES))
        .group_by(AttendanceEvent.attendance_session_id)
        .subquery()
    )

    total_subquery = (
        select(
            Enrollment.section_id.label("section_id"),
            func.count(func.distinct(Enrollment.student_id)).label("total_students"),
        )
        .group_by(Enrollment.section_id)
        .subquery()
    )

    stmt = (
        select(
            AttendanceSession.id.label("session_id"),
            func.coalesce(present_subquery.c.present_count, 0).label("present_count"),
            func.coalesce(total_subquery.c.total_students, 0).label("total_students"),
        )
        .outerjoin(
            present_subquery,
            AttendanceSession.id == present_subquery.c.session_id,
        )
        .outerjoin(
            total_subquery,
            AttendanceSession.section_id == total_subquery.c.section_id,
        )
        .where(AttendanceSession.id.in_(session_ids))
    )

    stats: dict[UUID, dict] = {}
    for row in (await db.execute(stmt)).all():
        present_count = int(row.present_count)
        total_students = int(row.total_students)
        stats[row.session_id] = {
            "present_count": present_count,
            "total_students": total_students,
            "attendance_percentage": compute_percentage(
                present_count, total_students
            ),
        }
    return stats


async def _resolve_absence_device_id(db: AsyncSession, section_id: UUID) -> UUID | None:
    """Pick a device for auto-generated Absent rows without changing the schema."""
    device_id = await db.scalar(
        select(Device.id)
        .where(Device.section_id == section_id)
        .order_by(Device.created_at.asc())
        .limit(1)
    )
    if device_id is not None:
        return device_id

    # Fall back to any device so the NOT NULL foreign key can still be met.
    return await db.scalar(
        select(Device.id).order_by(Device.created_at.asc()).limit(1)
    )


async def insert_absent_events(
    db: AsyncSession,
    *,
    session_id: UUID,
    section_id: UUID,
    now: datetime | None = None,
) -> int:
    """
    Insert Absent events for enrolled students that have no event in the session.

    Idempotent (NOT EXISTS + ON CONFLICT DO NOTHING) and does not commit, so the
    caller can keep the close operation in a single transaction.
    """
    device_id = await _resolve_absence_device_id(db, section_id)
    if device_id is None:
        return 0

    competing_event = AttendanceEvent.__table__.alias("competing_event")
    has_event = (
        select(competing_event.c.id)
        .where(
            competing_event.c.student_id == Enrollment.student_id,
            competing_event.c.attendance_session_id == session_id,
        )
        .exists()
    )

    student_ids = list(
        (
            await db.scalars(
                select(Enrollment.student_id).where(
                    Enrollment.section_id == section_id,
                    ~has_event,
                )
            )
        ).all()
    )
    if not student_ids:
        return 0

    stmt = (
        pg_insert(AttendanceEvent)
        .values(
            [
                {
                    "student_id": student_id,
                    "attendance_session_id": session_id,
                    "section_id": section_id,
                    "device_id": device_id,
                    "method_used": "MANUAL",
                    "final_status": "Absent",
                }
                for student_id in student_ids
            ]
        )
        .on_conflict_do_nothing(
            index_elements=["student_id", "attendance_session_id"]
        )
    )
    await db.execute(stmt)
    return len(student_ids)

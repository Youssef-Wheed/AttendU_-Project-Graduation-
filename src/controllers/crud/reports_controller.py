from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from Models import AttendanceEvent, AttendanceSession, Course, Enrollment, Section, Student, User
from helpers.attendance_stats import get_session_attendance_stats


class ReportsController:
    async def list_attendance_sessions(
        self,
        db: AsyncSession,
        current_user: User,
        *,
        course_id: UUID | None = None,
        section_id: UUID | None = None,
        course_code: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[dict]:
        stmt = (
            select(
                AttendanceSession.id.label("id"),
                AttendanceSession.created_at.label("created_at"),
                AttendanceSession.updated_at.label("updated_at"),
                AttendanceSession.section_id.label("section_id"),
                Section.section_name.label("section_name"),
                Course.id.label("course_id"),
                Course.course_name.label("course_name"),
                Course.course_code.label("course_code"),
                AttendanceSession.created_by_id.label("created_by_id"),
                AttendanceSession.title.label("title"),
                AttendanceSession.start_time.label("start_time"),
                AttendanceSession.end_time.label("end_time"),
                AttendanceSession.is_active.label("is_active"),
                AttendanceSession.verification_method.label("verification_method"),
            )
            .select_from(AttendanceSession)
            .join(Section, Section.id == AttendanceSession.section_id)
            .join(Course, Course.id == Section.course_id)
        )

        if current_user.role != "admin":
            stmt = stmt.where(Section.instructor_id == current_user.id)

        if course_id is not None:
            stmt = stmt.where(Course.id == course_id)

        if section_id is not None:
            stmt = stmt.where(AttendanceSession.section_id == section_id)

        if course_code:
            stmt = stmt.where(Course.course_code.ilike(course_code.strip()))

        if date_from is not None:
            stmt = stmt.where(AttendanceSession.start_time >= date_from)

        if date_to is not None:
            stmt = stmt.where(AttendanceSession.start_time <= date_to)

        stmt = stmt.order_by(AttendanceSession.start_time.desc())
        stmt = stmt.offset(max(offset, 0)).limit(max(min(limit, 200), 1))

        rows = (await db.execute(stmt)).all()
        stats_by_session = await get_session_attendance_stats(
            db, [row.id for row in rows]
        )

        return [
            {
                "id": row.id,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "section_id": row.section_id,
                "section_name": row.section_name,
                "course_id": row.course_id,
                "course_name": row.course_name,
                "course_code": row.course_code,
                "created_by_id": row.created_by_id,
                "title": row.title,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "is_active": row.is_active,
                "verification_method": row.verification_method,
                **stats_by_session.get(
                    row.id,
                    {
                        "present_count": 0,
                        "total_students": 0,
                        "attendance_percentage": 0.0,
                    },
                ),
            }
            for row in rows
        ]

    async def get_course_attendance_detailed(
        self,
        db: AsyncSession,
        current_user: User,
        course_id: UUID,
    ) -> list[dict]:
        """
        Fetches detailed attendance records for a specific course.
        Includes student info, session info, and status.
        """
        stmt = (
            select(
                Student.full_name.label("student_name"),
                Student.email.label("student_email"),
                Course.course_name.label("course_name"),
                Course.course_code.label("course_code"),
                Section.section_name.label("section_name"),
                AttendanceSession.title.label("session_title"),
                AttendanceSession.start_time.label("session_date"),
                AttendanceEvent.final_status.label("status"),
                AttendanceEvent.method_used.label("method"),
                AttendanceEvent.created_at.label("checkin_time"),
            )
            .select_from(AttendanceEvent)
            .join(Student, Student.id == AttendanceEvent.student_id)
            .join(
                AttendanceSession,
                AttendanceSession.id == AttendanceEvent.attendance_session_id,
            )
            .join(Section, Section.id == AttendanceEvent.section_id)
            .join(Course, Course.id == Section.course_id)
            .where(Course.id == course_id)
        )

        if current_user.role != "admin":
            stmt = stmt.where(Section.instructor_id == current_user.id)

        stmt = stmt.order_by(AttendanceSession.start_time.desc(), Student.full_name.asc())

        rows = (await db.execute(stmt)).all()
        return [dict(row._mapping) for row in rows]


reports_controller = ReportsController()

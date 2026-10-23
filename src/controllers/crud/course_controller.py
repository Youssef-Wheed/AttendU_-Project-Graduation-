from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from Models import (
    AttendanceSession,
    AttendanceEvent,
    Course,
    Enrollment,
    Section,
    Student,
    User,
)
from controllers.base_controller import CRUDBaseController
from helpers.attendance_stats import get_student_attendance_stats
from Models.schemas.course import CourseCreate, CourseUpdate


class CourseController(CRUDBaseController[Course]):
    def __init__(self) -> None:
        super().__init__(Course)

    async def create_course(self, db: AsyncSession, payload: CourseCreate) -> Course:
        return await self.create(db, payload.model_dump())

    async def update_course(
        self, db: AsyncSession, course: Course, payload: CourseUpdate
    ) -> Course:
        return await self.update(db, course, payload.model_dump(exclude_unset=True))

    async def search(
        self, db: AsyncSession, query: str, *, offset: int = 0, limit: int = 50
    ) -> list[Course]:
        stmt = (
            select(Course)
            .where(
                or_(
                    Course.course_name.ilike(f"%{query}%"),
                    Course.course_code.ilike(f"%{query}%"),
                )
            )
            .offset(max(offset, 0))
            .limit(max(min(limit, 100), 1))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def list_course_students_with_attendance(
        self,
        db: AsyncSession,
        course_id: UUID,
        current_user: User,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[dict]:
        accessible_sections_stmt = select(Section.id).where(
            Section.course_id == course_id
        )
        if current_user.role == "instructor":
            accessible_sections_stmt = accessible_sections_stmt.where(
                Section.instructor_id == current_user.id
            )

        section_ids = list(
            (await db.scalars(accessible_sections_stmt)).all()
        )
        if not section_ids:
            return []

        enrolled_students_subquery = (
            select(Enrollment.student_id)
            .where(Enrollment.section_id.in_(section_ids))
            .distinct()
        )

        students_stmt = (
            select(Student)
            .where(Student.id.in_(enrolled_students_subquery))
            .order_by(Student.full_name.asc())
            .offset(max(offset, 0))
            .limit(max(min(limit, 200), 1))
        )
        students = list((await db.execute(students_stmt)).scalars().all())

        stats = await get_student_attendance_stats(
            db,
            [student.id for student in students],
            section_ids=section_ids,
        )

        return [
            {
                "id": student.id,
                "created_at": student.created_at,
                "updated_at": student.updated_at,
                "full_name": student.full_name,
                "email": student.email,
                "phone": student.phone,
                "rfid_uid": student.rfid_uid,
                "face_reference_image": student.face_reference_image,
                "attendance_percentage": stats[student.id]["percentage"],
            }
            for student in students
        ]

    async def get_course_dashboard(
        self,
        db: AsyncSession,
        course_id: UUID,
        current_user: User,
    ) -> dict:
        accessible_sections_stmt = select(Section.id).where(
            Section.course_id == course_id
        )
        if current_user.role == "instructor":
            accessible_sections_stmt = accessible_sections_stmt.where(
                Section.instructor_id == current_user.id
            )

        accessible_sections_subquery = accessible_sections_stmt.subquery()

        total_students_stmt = select(
            func.count(func.distinct(Enrollment.student_id))
        ).where(Enrollment.section_id.in_(select(accessible_sections_subquery.c.id)))
        total_students = (await db.scalar(total_students_stmt)) or 0

        total_possible_stmt = (
            select(func.count())
            .select_from(AttendanceSession)
            .join(Enrollment, Enrollment.section_id == AttendanceSession.section_id)
            .where(
                AttendanceSession.section_id.in_(
                    select(accessible_sections_subquery.c.id)
                )
            )
        )
        total_possible = (await db.scalar(total_possible_stmt)) or 0

        present_count_stmt = select(func.count()).where(
            AttendanceEvent.section_id.in_(select(accessible_sections_subquery.c.id)),
            AttendanceEvent.final_status == "Present",
        )
        present_count = (await db.scalar(present_count_stmt)) or 0

        absent_count = max(total_possible - present_count, 0)
        attendance_percentage = 0.0
        if total_possible > 0:
            attendance_percentage = round((present_count / total_possible) * 100, 2)

        weekly_summaries = await self._build_period_summaries(
            db,
            accessible_sections_subquery,
            period="week",
        )
        monthly_summaries = await self._build_period_summaries(
            db,
            accessible_sections_subquery,
            period="month",
        )

        return {
            "total_students": total_students,
            "present_count": present_count,
            "absent_count": absent_count,
            "attendance_percentage": attendance_percentage,
            "weekly_summaries": weekly_summaries,
            "monthly_summaries": monthly_summaries,
        }

    async def _build_period_summaries(
        self,
        db: AsyncSession,
        accessible_sections_subquery,
        *,
        period: str,
    ) -> list[dict]:
        period_start = func.date_trunc(period, AttendanceSession.start_time).label(
            "period_start"
        )

        totals_stmt = (
            select(
                period_start,
                func.count(func.distinct(AttendanceSession.id)).label("total_sessions"),
                func.count().label("total_possible"),
            )
            .select_from(AttendanceSession)
            .join(Enrollment, Enrollment.section_id == AttendanceSession.section_id)
            .where(
                AttendanceSession.section_id.in_(
                    select(accessible_sections_subquery.c.id)
                )
            )
            .group_by(period_start)
            .order_by(period_start.asc())
        )
        total_rows = (await db.execute(totals_stmt)).all()

        event_period_start = func.date_trunc(
            period, AttendanceSession.start_time
        ).label("period_start")
        presents_stmt = (
            select(
                event_period_start,
                func.count().label("present_count"),
            )
            .select_from(AttendanceSession)
            .join(
                AttendanceEvent,
                AttendanceEvent.attendance_session_id == AttendanceSession.id,
            )
            .where(
                AttendanceSession.section_id.in_(
                    select(accessible_sections_subquery.c.id)
                ),
                AttendanceEvent.final_status == "Present",
            )
            .group_by(event_period_start)
        )
        present_rows = (await db.execute(presents_stmt)).all()
        present_counts_by_period = {
            row.period_start: row.present_count for row in present_rows
        }

        summaries = []
        for row in total_rows:
            present_count = present_counts_by_period.get(row.period_start, 0)
            absent_count = max(row.total_possible - present_count, 0)
            attendance_percentage = 0.0
            if row.total_possible > 0:
                attendance_percentage = round(
                    (present_count / row.total_possible) * 100,
                    2,
                )

            summaries.append(
                {
                    "period_start": row.period_start,
                    "total_sessions": row.total_sessions,
                    "present_count": present_count,
                    "absent_count": absent_count,
                    "attendance_percentage": attendance_percentage,
                }
            )

        return summaries


course_controller = CourseController()

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from Models import Student
from Models.enrollmentsModel import Enrollment
from controllers.base_controller import CRUDBaseController
from Models.schemas.student import StudentCreate, StudentUpdate


class StudentController(CRUDBaseController[Student]):
    def __init__(self) -> None:
        super().__init__(Student)

    async def _load_with_enrollments(self, db: AsyncSession, student_id: UUID) -> Student:
        student = await self.get_by_id(db, student_id)
        if student is None:
            raise ValueError("student not found")
        return student

    async def get_by_id(self, db: AsyncSession, entity_id: UUID) -> Student | None:
        result = await db.execute(
            select(Student)
            .options(selectinload(Student.enrollments))
            .where(Student.id == entity_id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self, db: AsyncSession, *, offset: int = 0, limit: int = 100
    ) -> list[Student]:
        result = await db.execute(
            select(Student)
            .options(selectinload(Student.enrollments))
            .offset(max(offset, 0))
            .limit(max(min(limit, 200), 1))
        )
        return list(result.scalars().all())

    async def create_student(self, db: AsyncSession, payload: StudentCreate) -> Student:
        data = payload.model_dump()
        section_ids: list[UUID] = data.pop("section_ids", [])

        student = Student(**data)
        db.add(student)
        await db.flush()

        for section_id in section_ids:
            enrollment = Enrollment(student_id=student.id, section_id=section_id)
            db.add(enrollment)

        await db.commit()
        return await self._load_with_enrollments(db, student.id)

    async def update_student(
        self, db: AsyncSession, student: Student, payload: StudentUpdate
    ) -> Student:
        data = payload.model_dump(exclude_unset=True)
        section_ids: list[UUID] | None = data.pop("section_ids", None)

        for key, value in data.items():
            setattr(student, key, value)

        if section_ids is not None:
            existing = await db.execute(
                select(Enrollment).where(Enrollment.student_id == student.id)
            )
            for enrollment in existing.scalars().all():
                await db.delete(enrollment)
            await db.flush()
            for section_id in section_ids:
                db.add(Enrollment(student_id=student.id, section_id=section_id))

        await db.commit()
        return await self._load_with_enrollments(db, student.id)

    async def search(
        self, db: AsyncSession, query: str, *, offset: int = 0, limit: int = 50
    ) -> list[Student]:
        stmt = (
            select(Student)
            .options(selectinload(Student.enrollments))
            .where(
                or_(
                    Student.full_name.ilike(f"%{query}%"),
                    Student.email.ilike(f"%{query}%"),
                    Student.rfid_uid.ilike(f"%{query}%"),
                )
            )
            .offset(max(offset, 0))
            .limit(max(min(limit, 100), 1))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())


student_controller = StudentController()

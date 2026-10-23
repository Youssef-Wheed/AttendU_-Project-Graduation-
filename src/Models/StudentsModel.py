from uuid import UUID
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from helpers.database import Base
from Models.base_data_model import BaseDataModel


# the mapped --> typing in orm form tell the python is [type]
class Student(Base, BaseDataModel):
    __tablename__ = "students"
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        String(120), unique=True, index=True, nullable=False
    )
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    rfid_uid: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    face_reference_image: Mapped[str | None] = mapped_column(Text, nullable=True)

    enrollments = relationship(
        "Enrollment", back_populates="student", cascade="all, delete-orphan"
    )
    attendance_events = relationship(
        "AttendanceEvent", back_populates="student", cascade="all, delete-orphan"
    )

    @property
    def section_ids(self) -> list[UUID]:
        return [e.section_id for e in self.enrollments]

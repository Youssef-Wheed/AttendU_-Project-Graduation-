from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import EmailStr, Field

from Models.schemas.base import ORMModel, TimestampedResponse


class StudentCreate(ORMModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    rfid_uid: str = Field(min_length=3, max_length=50)
    face_reference_image: Optional[str] = None
    section_ids: list[UUID] = Field(default_factory=list)


class StudentUpdate(ORMModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    rfid_uid: str | None = Field(default=None, min_length=3, max_length=50)
    face_reference_image: str | None = None
    section_ids: list[UUID] | None = None


class StudentResponse(TimestampedResponse):
    full_name: str
    email: EmailStr
    phone: str | None
    rfid_uid: str
    face_reference_image: str | None
    section_ids: list[UUID] = Field(default_factory=list)
    attendance_rate: float = 0.0


class StudentFaceRegistrationResponse(ORMModel):
    message: str
    student_id: UUID
    file_path: str
    has_encoding: bool


class StudentReportIdentity(ORMModel):
    id: UUID
    full_name: str
    email: EmailStr
    rfid_uid: str


class StudentReportSessionResponse(ORMModel):
    session_id: UUID
    title: str
    date: datetime
    status: Literal["Present", "Absent"]


class StudentReportCourseResponse(ORMModel):
    course_id: UUID
    course_code: str
    course_name: str
    section_id: UUID
    section_name: str
    instructor_name: str
    attended: int
    absent: int
    total_sessions: int
    percentage: float
    status: Literal["Good standing", "Needs attention", "Critical risk"]
    sessions: list[StudentReportSessionResponse]


class StudentReportTotals(ORMModel):
    courses: int
    attended: int
    absent: int
    total_sessions: int
    percentage: float


class StudentReportResponse(ORMModel):
    student: StudentReportIdentity
    courses: list[StudentReportCourseResponse]
    totals: StudentReportTotals
    generated_at: datetime

from typing import Optional
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


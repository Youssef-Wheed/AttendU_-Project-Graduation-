from datetime import datetime
from uuid import UUID

from pydantic import Field

from Models.schemas.base import ORMModel, TimestampedResponse


class AttendanceSessionCreate(ORMModel):
    section_id: UUID
    created_by_id: UUID
    title: str = Field(min_length=3, max_length=120)
    start_time: datetime
    end_time: datetime
    verification_method: str = Field(
        default="RFID",
        pattern="^(RFID|FACE|RFID_FACE|MANUAL)$",
    )


class AttendanceSessionUpdate(ORMModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_active: bool | None = None


class AttendanceSessionResponse(TimestampedResponse):
    section_id: UUID
    created_by_id: UUID
    title: str
    start_time: datetime
    end_time: datetime
    is_active: bool
    verification_method: str
    section_name: str | None = None
    course_id: UUID | None = None
    course_name: str | None = None
    course_code: str | None = None
    present_count: int | None = None
    total_students: int | None = None
    attendance_percentage: float | None = None


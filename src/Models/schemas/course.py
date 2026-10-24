from datetime import datetime

from pydantic import Field

from Models.schemas.base import ORMModel, TimestampedResponse
from Models.schemas.student import StudentResponse


class CourseCreate(ORMModel):
    course_name: str = Field(min_length=2, max_length=100)
    course_code: str = Field(min_length=2, max_length=20)


class CourseUpdate(ORMModel):
    course_name: str | None = Field(default=None, min_length=2, max_length=100)
    course_code: str | None = Field(default=None, min_length=2, max_length=20)


class CourseResponse(TimestampedResponse):
    course_name: str
    course_code: str


class CourseStudentAttendanceResponse(StudentResponse):
    attendance_percentage: float
    present_count: int
    total_sessions: int


class CourseAttendanceSummary(ORMModel):
    period_start: datetime
    total_sessions: int
    present_count: int
    absent_count: int
    attendance_percentage: float


class CourseDashboardResponse(ORMModel):
    total_students: int
    present_count: int
    absent_count: int
    attendance_percentage: float
    weekly_summaries: list[CourseAttendanceSummary]
    monthly_summaries: list[CourseAttendanceSummary]

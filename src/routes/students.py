from datetime import datetime, timezone
from fastapi.responses import JSONResponse
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.crud.student_controller import student_controller
from helpers.attendance_stats import (
    ATTENDED_STATUSES,
    ended_session_condition,
    get_student_attendance_stats,
    get_student_course_attendance_stats,
)
from helpers.database import async_get_db
from helpers.dependencies import get_current_user, ensure_admin
from Models import AttendanceEvent, AttendanceSession, Course, Enrollment, Section, User
from Models.schemas.student import (
    StudentCreate,
    StudentFaceRegistrationResponse,
    StudentReportResponse,
    StudentResponse,
    StudentUpdate,
)
from services.face_recognition_service import register_face, invalidate_cache


router = APIRouter(prefix="/students", tags=["students"])


async def _attach_attendance_rates(
    db: AsyncSession, students: list
) -> list:
    stats = await get_student_attendance_stats(db, [student.id for student in students])
    for student in students:
        student.attendance_rate = stats[student.id]["percentage"]
    return students


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    try:
        return await student_controller.create_student(db, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="student email or RFID already exists",
        ) from exc


@router.get("", response_model=List[StudentResponse])
async def list_students(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    students = await student_controller.list_all(db, offset=offset, limit=limit)
    return await _attach_attendance_rates(db, students)


@router.get("/search", response_model=List[StudentResponse])
async def search_students(
    query: str = Query(min_length=1),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    students = await student_controller.search(
        db, query=query, offset=offset, limit=limit
    )
    return await _attach_attendance_rates(db, students)


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )
    await _attach_attendance_rates(db, [student])
    return student


@router.get("/{student_id}/report", response_model=StudentReportResponse)
async def get_student_report(
    student_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )

    generated_at = datetime.now(timezone.utc)
    overall_stats = await get_student_attendance_stats(
        db, [student_id], now=generated_at
    )
    course_stats = await get_student_course_attendance_stats(
        db, student_id, now=generated_at
    )

    report_rows = (
        await db.execute(
            select(
                Course.id.label("course_id"),
                Course.course_code,
                Course.course_name,
                Section.id.label("section_id"),
                Section.section_name,
                User.full_name.label("instructor_name"),
                AttendanceSession.id.label("session_id"),
                AttendanceSession.title.label("session_title"),
                AttendanceSession.start_time.label("session_date"),
                AttendanceEvent.final_status.label("final_status"),
            )
            .select_from(Enrollment)
            .join(Section, Section.id == Enrollment.section_id)
            .join(Course, Course.id == Section.course_id)
            .join(User, User.id == Section.instructor_id)
            .outerjoin(
                AttendanceSession,
                and_(
                    AttendanceSession.section_id == Section.id,
                    ended_session_condition(generated_at),
                ),
            )
            .outerjoin(
                AttendanceEvent,
                and_(
                    AttendanceEvent.attendance_session_id == AttendanceSession.id,
                    AttendanceEvent.student_id == student_id,
                ),
            )
            .where(Enrollment.student_id == student_id)
            .order_by(
                Course.course_code.asc(),
                Section.section_name.asc(),
                AttendanceSession.start_time.asc(),
            )
        )
    ).all()

    courses_by_id: dict[UUID, dict] = {}
    sections_by_course: dict[UUID, dict[UUID, str]] = {}
    for row in report_rows:
        course = courses_by_id.setdefault(
            row.course_id,
            {
                "course_id": row.course_id,
                "course_code": row.course_code,
                "course_name": row.course_name,
                "instructor_name": row.instructor_name,
                "sessions": [],
            },
        )
        sections_by_course.setdefault(row.course_id, {})[row.section_id] = (
            row.section_name
        )

        if row.session_id is not None:
            course["sessions"].append(
                {
                    "session_id": row.session_id,
                    "title": row.session_title,
                    "date": row.session_date,
                    "status": (
                        "Present"
                        if row.final_status in ATTENDED_STATUSES
                        else "Absent"
                    ),
                }
            )

    courses = []
    for course_id, course in courses_by_id.items():
        course_sections = sections_by_course[course_id]
        section_ids = sorted(course_sections, key=lambda value: course_sections[value])
        stats = course_stats.get(
            course_id, {"attended": 0, "total": 0, "percentage": 0.0}
        )
        percentage = stats["percentage"]
        if percentage >= 75:
            standing = "Good standing"
        elif percentage >= 50:
            standing = "Needs attention"
        else:
            standing = "Critical risk"

        course["sessions"].sort(key=lambda session: session["date"])
        courses.append(
            {
                **course,
                "section_id": section_ids[0],
                "section_name": ", ".join(
                    dict.fromkeys(course_sections[section_id] for section_id in section_ids)
                ),
                "attended": stats["attended"],
                "absent": stats["total"] - stats["attended"],
                "total_sessions": stats["total"],
                "percentage": percentage,
                "status": standing,
            }
        )
    courses.sort(key=lambda course: course["course_code"])

    totals = overall_stats[student_id]
    return {
        "student": {
            "id": student.id,
            "full_name": student.full_name,
            "email": student.email,
            "rfid_uid": student.rfid_uid,
        },
        "courses": courses,
        "totals": {
            "courses": len(courses),
            "attended": totals["attended"],
            "absent": totals["total"] - totals["attended"],
            "total_sessions": totals["total"],
            "percentage": totals["percentage"],
        },
        "generated_at": generated_at,
    }


@router.post(
    "/{student_id}/face",
    response_model=StudentFaceRegistrationResponse,
    status_code=status.HTTP_200_OK,
)
async def register_student_face(
    student_id: UUID,
    image: UploadFile = File(..., description="JPEG or PNG face photo, one person only"),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and register a student's reference face photo.

    - Admin only
    - Image must contain exactly one face
    - Saves both the original image and pre-computed encoding to disk
    - Updates student.face_reference_image with the file path
    - Invalidates the in-memory encoding cache for this student
    """
    ensure_admin(current_user)

    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="student not found",
        )

    # Validate file type
    if image.content_type not in ("image/jpeg", "image/png", "image/jpg"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="image must be JPEG or PNG",
        )

    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="image must be smaller than 10MB",
        )

    try:
        file_path = await register_face(student_id, image_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    # Invalidate cache for this student before updating DB
    invalidate_cache(student_id)

    # Update student record
    await student_controller.update_student(
        db,
        student,
        StudentUpdate(face_reference_image=file_path),
    )

    return StudentFaceRegistrationResponse(
        message="Face registered successfully",
        student_id=student_id,
        file_path=file_path,
        has_encoding=True,
    )


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )

    try:
        return await student_controller.update_student(db, student, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="student email or RFID already exists",
        ) from exc


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    ensure_admin(current_user)
    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )
    await student_controller.delete(db, student)
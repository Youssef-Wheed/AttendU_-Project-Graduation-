from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from controllers.crud.reports_controller import reports_controller
from helpers.database import async_get_db
from helpers.dependencies import ensure_admin_or_instructor, get_current_user
from helpers.exporters import generate_excel_report, generate_pdf_report
from Models import User, Course
from Models.schemas.attendance_report import AttendanceReportSessionSummary


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/attendance", response_model=List[AttendanceReportSessionSummary])
async def list_attendance_reports(
    course_id: UUID | None = Query(default=None),
    section_id: UUID | None = Query(default=None),
    course_code: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin_or_instructor(current_user)
    return await reports_controller.list_attendance_sessions(
        db,
        current_user,
        course_id=course_id,
        section_id=section_id,
        course_code=course_code,
        date_from=date_from,
        date_to=date_to,
        offset=offset,
        limit=limit,
    )


@router.get("/export")
async def export_attendance(
    format: str = Query(..., pattern="^(excel|pdf)$"),
    course_id: UUID = Query(...),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin_or_instructor(current_user)

    # Verify course exists
    course = await db.scalar(select(Course).where(Course.id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    data = await reports_controller.get_course_attendance_detailed(
        db, current_user, course_id
    )

    if not data:
        raise HTTPException(
            status_code=404, detail="No attendance records found for this course"
        )

    filename = f"attendance_{course.course_code}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    if format == "excel":
        file_handle = generate_excel_report(data, course.course_name)
        return StreamingResponse(
            file_handle,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"},
        )
    else:
        file_handle = generate_pdf_report(data, course.course_name)
        return StreamingResponse(
            file_handle,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"},
        )

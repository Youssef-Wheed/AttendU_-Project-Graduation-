from datetime import date, datetime, time, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.crud.attendance_session_controller import attendance_session_controller
from controllers.crud.reports_controller import reports_controller
from helpers.database import async_get_db
from helpers.dependencies import (
    ensure_admin_or_self,
    ensure_section_access,
    ensure_session_access,
    get_current_user,
)
from Models import Enrollment, User
from Models.schemas.attendance_session import (
    AttendanceSessionCreate,
    AttendanceSessionResponse,
    AttendanceSessionUpdate,
)
from services.face_recognition_service import preload_encodings_for_section


router = APIRouter(prefix="/attendance-sessions", tags=["attendance-sessions"])


@router.post(
    "", response_model=AttendanceSessionResponse, status_code=status.HTTP_201_CREATED
)
async def create_attendance_session(
    payload: AttendanceSessionCreate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin_or_self(current_user, payload.created_by_id)
    await ensure_section_access(db, current_user, payload.section_id, write=True)
    try:
        return await attendance_session_controller.create_session(db, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="session violates a uniqueness or foreign-key rule",
        ) from exc


@router.get("", response_model=List[AttendanceSessionResponse])
async def list_attendance_sessions(
    course_id: UUID | None = Query(default=None),
    section_id: UUID | None = Query(default=None),
    course_code: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    # Keep closing expired windows (and storing their Absent rows) before listing.
    await attendance_session_controller.close_expired_sessions(db)

    date_from = (
        datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        if start_date
        else None
    )
    date_to = (
        datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        if end_date
        else None
    )

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


@router.get("/active", response_model=List[AttendanceSessionResponse])
async def list_active_sessions(
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = await attendance_session_controller.list_active(db)
    if current_user.role == "admin":
        return sessions
    return [session for session in sessions if session.created_by_id == current_user.id]


@router.get("/{session_id}", response_model=AttendanceSessionResponse)
async def get_attendance_session(
    session_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_session_access(db, current_user, session_id, write=False)
    session = await attendance_session_controller.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session not found"
        )
    return session


@router.post("/{session_id}/stop", response_model=AttendanceSessionResponse)
async def stop_attendance_session(
    session_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_session_access(db, current_user, session_id, write=True)
    session = await attendance_session_controller.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session not found"
        )
    if not session.is_active:
        # Idempotent stop: the session may already have been auto-closed
        # because its window elapsed. Return the closed session as-is.
        return session
    return await attendance_session_controller.stop_session(db, session)


@router.post("/{session_id}/preload-faces", status_code=status.HTTP_200_OK)
async def preload_session_faces(
    session_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pre-load face encodings for all enrolled students in the session's section.
    Call this when starting an RFID_FACE session to warm the encoding cache.
    Returns count of students with registered faces.
    """
    await ensure_session_access(db, current_user, session_id, write=False)

    session = await attendance_session_controller.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")

    # Get all enrolled student IDs for this section
    result = await db.execute(
        select(Enrollment.student_id).where(
            Enrollment.section_id == session.section_id
        )
    )
    student_ids = [row[0] for row in result.all()]

    loaded = preload_encodings_for_section(student_ids)

    return {
        "message": "face encodings pre-loaded",
        "total_enrolled": len(student_ids),
        "faces_loaded": loaded,
        "missing_faces": len(student_ids) - loaded,
    }


@router.put("/{session_id}", response_model=AttendanceSessionResponse)
async def update_attendance_session(
    session_id: UUID,
    payload: AttendanceSessionUpdate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_session_access(db, current_user, session_id, write=True)
    session = await attendance_session_controller.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session not found"
        )

    try:
        return await attendance_session_controller.update_session(db, session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="session violates a uniqueness or foreign-key rule",
        ) from exc


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance_session(
    session_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await ensure_session_access(db, current_user, session_id, write=True)
    session = await attendance_session_controller.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session not found"
        )
    await attendance_session_controller.delete(db, session)


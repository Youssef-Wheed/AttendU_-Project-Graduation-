from fastapi.responses import JSONResponse
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.crud.student_controller import student_controller
from helpers.attendance_stats import get_student_attendance_stats
from helpers.database import async_get_db
from helpers.dependencies import get_current_user, ensure_admin
from Models import User
from Models.schemas.student import (
    StudentCreate,
    StudentFaceRegistrationResponse,
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
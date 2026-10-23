from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from controllers.crud.section_controller import section_controller
from controllers.crud.student_controller import student_controller
from helpers.database import async_get_db
from helpers.dependencies import (
    ensure_admin_or_self,
    ensure_section_access,
    get_current_user,
)
from Models import Enrollment, Student, User
from Models.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from Models.schemas.student import StudentResponse


router = APIRouter(prefix="/sections", tags=["sections"])


@router.post("", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section(
    payload: SectionCreate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin_or_self(current_user, payload.instructor_id)
    try:
        return await section_controller.create_section(db, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="section violates a uniqueness or foreign-key rule",
        ) from exc


@router.get("", response_model=list[SectionResponse])
async def list_sections(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    sections = await section_controller.list_all(db, offset=offset, limit=limit)
    if current_user.role == "admin":
        return sections
    return [section for section in sections if section.instructor_id == current_user.id]


@router.get("/{section_id}", response_model=SectionResponse)
async def get_section(
    section_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_section_access(db, current_user, section_id, write=False)
    section = await section_controller.get_by_id(db, section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="section not found"
        )
    return section


@router.get("/{section_id}/students", response_model=list[StudentResponse])
async def list_students_in_section(
    section_id: UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_section_access(db, current_user, section_id, write=False)

    section = await section_controller.get_by_id(db, section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="section not found"
        )

    result = await db.execute(
        select(Student)
        .options(selectinload(Student.enrollments))
        .join(Enrollment, Enrollment.student_id == Student.id)
        .where(Enrollment.section_id == section_id)
        .offset(offset)
        .limit(limit)
    )

    return list(result.scalars().all())


@router.post(
    "/{section_id}/students/{student_id}",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_student_in_section(
    section_id: UUID,
    student_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_section_access(db, current_user, section_id, write=True)

    student = await student_controller.get_by_id(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="student not found"
        )

    existing_enrollment = await db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.section_id == section_id,
        )
    )
    if existing_enrollment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="student is already enrolled in this section",
        )

    db.add(Enrollment(student_id=student_id, section_id=section_id))
    await db.commit()

    return student


@router.delete(
    "/{section_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_student_from_section(
    section_id: UUID,
    student_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await ensure_section_access(db, current_user, section_id, write=True)

    enrollment = await db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.section_id == section_id,
        )
    )

    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="enrollment not found",
        )

    await db.delete(enrollment)
    await db.commit()


@router.put("/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: UUID,
    payload: SectionUpdate,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_section_access(db, current_user, section_id, write=True)
    section = await section_controller.get_by_id(db, section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="section not found"
        )

    try:
        return await section_controller.update_section(db, section, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="section violates a uniqueness or foreign-key rule",
        ) from exc


@router.delete("/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_section(
    section_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_section_access(db, current_user, section_id, write=True)
    section = await section_controller.get_by_id(db, section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="section not found"
        )
    await section_controller.delete(db, section)

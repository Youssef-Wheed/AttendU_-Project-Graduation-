from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from uuid import UUID

from controllers.crud.user_controller import user_controller
from helpers.audit import log_action
from helpers.database import async_get_db
from helpers.dependencies import ensure_admin, get_current_user
from Models import AttendanceSession, Course, Enrollment, Section, User
from Models.schemas.user import (
    TeachingSectionResponse,
    UserAdminResponse,
    UserRegister,
    UserResponse,
    UserTeachingResponse,
)


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserAdminResponse])
async def list_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    section_counts = (
        select(
            Section.instructor_id.label("instructor_id"),
            func.count(Section.id).label("sections_count"),
        )
        .group_by(Section.instructor_id)
        .subquery()
    )
    result = await db.execute(
        select(User, func.coalesce(section_counts.c.sections_count, 0))
        .outerjoin(section_counts, section_counts.c.instructor_id == User.id)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
            "sections_count": int(sections_count),
        }
        for user, sections_count in result.all()
    ]


@router.get("/{user_id}/teaching", response_model=UserTeachingResponse)
async def get_user_teaching(
    user_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    user = await user_controller.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="user not found"
        )

    enrollment_counts = (
        select(
            Enrollment.section_id.label("section_id"),
            func.count(Enrollment.student_id).label("students_count"),
        )
        .group_by(Enrollment.section_id)
        .subquery()
    )
    session_counts = (
        select(
            AttendanceSession.section_id.label("section_id"),
            func.count(AttendanceSession.id).label("sessions_count"),
            func.max(AttendanceSession.start_time).label("last_session_at"),
        )
        .group_by(AttendanceSession.section_id)
        .subquery()
    )
    sections_result = await db.execute(
        select(
            Section.id,
            Section.section_name,
            Section.schedule_time,
            Course.id,
            Course.course_code,
            Course.course_name,
            func.coalesce(enrollment_counts.c.students_count, 0),
            func.coalesce(session_counts.c.sessions_count, 0),
            session_counts.c.last_session_at,
        )
        .join(Course, Course.id == Section.course_id)
        .outerjoin(enrollment_counts, enrollment_counts.c.section_id == Section.id)
        .outerjoin(session_counts, session_counts.c.section_id == Section.id)
        .where(Section.instructor_id == user_id)
        .order_by(Course.course_code, Section.section_name, Section.id)
    )
    sections = [
        TeachingSectionResponse(
            section_id=section_id,
            section_name=section_name,
            schedule_time=schedule_time,
            course_id=course_id,
            course_code=course_code,
            course_name=course_name,
            students_count=int(students_count),
            sessions_count=int(sessions_count),
            last_session_at=last_session_at,
        )
        for (
            section_id,
            section_name,
            schedule_time,
            course_id,
            course_code,
            course_name,
            students_count,
            sessions_count,
            last_session_at,
        ) in sections_result.all()
    ]
    totals = await db.execute(
        select(
            func.count(func.distinct(Enrollment.student_id)),
            func.count(Enrollment.student_id),
        )
        .join(Section, Section.id == Enrollment.section_id)
        .where(Section.instructor_id == user_id)
    )
    unique_students, total_enrollments = totals.one()
    return UserTeachingResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        sections=sections,
        sections_count=len(sections),
        unique_students=int(unique_students),
        total_enrollments=int(total_enrollments),
        sessions_count=sum(section.sessions_count for section in sections),
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserRegister,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    email_exists = await db.scalar(
        select(User.id).where(func.lower(User.email) == payload.email.lower()).limit(1)
    )
    if email_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists (email matching is case-insensitive).",
        )
    try:
        user = await user_controller.create_user(db, payload.model_dump())
        await log_action(
            db,
            actor_user_id=current_user.id,
            action="user.created",
            entity_type="user",
            entity_id=user.id,
            entity_label=user.full_name,
            source="api",
        )
        return user
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists (email matching is case-insensitive).",
        ) from exc


async def _count_user_references(
    db: AsyncSession, user_id: UUID
) -> tuple[int, int]:
    result = await db.execute(
        select(
            select(func.count(Section.id))
            .where(Section.instructor_id == user_id)
            .scalar_subquery(),
            select(func.count(AttendanceSession.id))
            .where(AttendanceSession.created_by_id == user_id)
            .scalar_subquery(),
        )
    )
    section_count, session_count = result.one()
    return int(section_count), int(session_count)


def _user_reference_conflict(section_count: int, session_count: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"This account is still referenced by {section_count} section(s) and "
            f"{session_count} attendance session(s). Reassign its sections and "
            "sessions before deleting it."
        ),
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    user = await user_controller.get_by_id(db, user_id)
    if not user:
        await user_controller.delete_user(db, user_id)
        return

    if user.role == "admin":
        admin_count = await db.scalar(
            select(func.count(User.id)).where(User.role == "admin")
        )
        if int(admin_count or 0) <= 1:
            if user_id == current_user.id:
                detail = (
                    "You cannot delete your own account, and it is the last "
                    "administrator."
                )
            else:
                detail = (
                    "This is the last administrator. Create another admin "
                    "before deleting this account."
                )
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot delete your own account while signed in.",
        )

    section_count, session_count = await _count_user_references(db, user_id)
    if section_count or session_count:
        raise _user_reference_conflict(section_count, session_count)

    try:
        await user_controller.delete_user(db, user_id)
    except IntegrityError as exc:
        await db.rollback()
        section_count, session_count = await _count_user_references(db, user_id)
        if section_count or session_count:
            raise _user_reference_conflict(section_count, session_count) from exc
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is still referenced by another record and cannot be deleted.",
        ) from exc

    if user:
        await log_action(
            db,
            actor_user_id=current_user.id,
            action="user.deleted",
            entity_type="user",
            entity_id=user.id,
            entity_label=user.full_name,
            source="api",
        )

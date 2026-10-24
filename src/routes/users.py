from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from uuid import UUID

from controllers.crud.user_controller import user_controller
from helpers.audit import log_action
from helpers.database import async_get_db
from helpers.dependencies import ensure_admin, get_current_user
from Models import User
from Models.schemas.user import UserResponse, UserRegister


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    return await user_controller.list_users(db, offset=offset, limit=limit)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserRegister,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
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
            detail="email already registered",
        ) from exc


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)
    user = await user_controller.get_by_id(db, user_id)
    await user_controller.delete_user(db, user_id)
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

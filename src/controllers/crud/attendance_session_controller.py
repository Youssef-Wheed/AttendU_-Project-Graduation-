from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from Models import AttendanceSession
from controllers.base_controller import CRUDBaseController
from Models.schemas.attendance_session import (
    AttendanceSessionCreate,
    AttendanceSessionUpdate,
)


class AttendanceSessionController(CRUDBaseController[AttendanceSession]):
    def __init__(self) -> None:
        super().__init__(AttendanceSession)

    async def close_expired_sessions(
        self,
        db: AsyncSession,
        section_id: UUID | None = None,
    ) -> list[UUID]:
        """
        Close sessions whose scheduled window has already elapsed.

        Sessions are closed lazily whenever they are read or a new one is
        started, so the lifecycle never depends on the frontend calling the
        stop endpoint. Idempotent; safe to call on every request.
        """
        now = datetime.now(timezone.utc)
        conditions = [
            AttendanceSession.is_active.is_(True),
            AttendanceSession.end_time < now,
        ]
        if section_id is not None:
            conditions.append(AttendanceSession.section_id == section_id)

        stmt = (
            update(AttendanceSession)
            .where(and_(*conditions))
            .values(is_active=False, updated_at=func.now())
            .returning(AttendanceSession.id)
            .execution_options(synchronize_session=False)
        )
        result = await db.execute(stmt)
        closed_ids = list(result.scalars().all())
        if closed_ids:
            await db.commit()
        return closed_ids

    async def create_session(
        self,
        db: AsyncSession,
        payload: AttendanceSessionCreate,
    ) -> AttendanceSession:
        if payload.end_time <= payload.start_time:
            raise ValueError("end_time must be after start_time")

        # Close any session of this section whose window already elapsed,
        # otherwise the uniqueness guard below (and uq_active_session_per_section)
        # would keep rejecting new sessions forever.
        await self.close_expired_sessions(db, section_id=payload.section_id)

        active_stmt = select(AttendanceSession).where(
            and_(
                AttendanceSession.section_id == payload.section_id,
                AttendanceSession.is_active.is_(True),
            )
        )
        active_session = (await db.execute(active_stmt)).scalar_one_or_none()
        if active_session:
            raise ValueError("an active session already exists for this section")

        return await self.create(db, payload.model_dump())

    async def update_session(
        self,
        db: AsyncSession,
        session: AttendanceSession,
        payload: AttendanceSessionUpdate,
    ) -> AttendanceSession:
        update_data = payload.model_dump(exclude_unset=True)
        next_start = update_data.get("start_time", session.start_time)
        next_end = update_data.get("end_time", session.end_time)
        if next_end <= next_start:
            raise ValueError("end_time must be after start_time")

        if update_data.get("is_active") is True and not session.is_active:
            await self.close_expired_sessions(db, section_id=session.section_id)
            active_stmt = select(AttendanceSession).where(
                and_(
                    AttendanceSession.section_id == session.section_id,
                    AttendanceSession.is_active.is_(True),
                    AttendanceSession.id != session.id,
                )
            )
            active_session = (await db.execute(active_stmt)).scalar_one_or_none()
            if active_session:
                raise ValueError(
                    "cannot activate session: another active session exists"
                )

        return await self.update(db, session, update_data)

    async def stop_session(
        self,
        db: AsyncSession,
        session: AttendanceSession,
    ) -> AttendanceSession:
        now = datetime.now(timezone.utc)
        if session.end_time <= now:
            end_time = session.end_time  # window already elapsed: keep the true end
        elif now > session.start_time:
            end_time = now  # stopped early: close immediately
        else:
            end_time = session.end_time  # not started yet: keep the planned end
        return await self.update(db, session, {"is_active": False, "end_time": end_time})

    async def list_active(self, db: AsyncSession) -> list[AttendanceSession]:
        await self.close_expired_sessions(db)
        now = datetime.now(timezone.utc)
        stmt = select(AttendanceSession).where(
            and_(
                AttendanceSession.is_active.is_(True),
                AttendanceSession.start_time <= now,
                AttendanceSession.end_time >= now,
            )
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_for_section(
        self,
        db: AsyncSession,
        section_id: UUID,
    ) -> AttendanceSession | None:
        await self.close_expired_sessions(db, section_id=section_id)
        now = datetime.now(timezone.utc)
        stmt = select(AttendanceSession).where(
            and_(
                AttendanceSession.section_id == section_id,
                AttendanceSession.is_active.is_(True),
                AttendanceSession.start_time <= now,
                AttendanceSession.end_time >= now,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(
        self,
        db: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[AttendanceSession]:
        await self.close_expired_sessions(db)
        return await super().list_all(db, offset=offset, limit=limit)


attendance_session_controller = AttendanceSessionController()

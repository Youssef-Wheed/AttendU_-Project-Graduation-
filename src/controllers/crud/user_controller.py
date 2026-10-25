from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from Models import User
from controllers.base_controller import CRUDBaseController
from helpers.auth import get_password_hash


class UserController(CRUDBaseController[User]):
    def __init__(self) -> None:
        super().__init__(User)

    async def list_users(
        self, db: AsyncSession, *, offset: int = 0, limit: int = 50
    ) -> list[User]:
        return await self.list_all(db, offset=offset, limit=limit)

    async def create_user(self, db: AsyncSession, payload: dict) -> User:
        if "password" in payload:
            payload["password_hash"] = get_password_hash(payload.pop("password"))
        return await self.create(db, payload)

    async def delete_user(self, db: AsyncSession, user_id: UUID) -> None:
        user = await self.get_by_id(db, user_id)
        if user:
            await self.delete(db, user)


user_controller = UserController()

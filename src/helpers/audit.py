import logging
from typing import Any, Literal
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from Models import AuditLog
from helpers.database import AsyncSessionLocal


logger = logging.getLogger(__name__)

_SENSITIVE_FIELDS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "face_reference_image",
}


def build_changes(entity: Any, updates: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changes: dict[str, dict[str, Any]] = {}
    for field, new_value in updates.items():
        old_value = getattr(entity, field, None)
        if old_value != new_value:
            if field in _SENSITIVE_FIELDS:
                changes[field] = {"changed": True}
            else:
                changes[field] = {"old": old_value, "new": new_value}
    return changes


async def log_action(
    db: AsyncSession,
    *,
    actor_user_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | str,
    entity_label: str,
    changes: dict[str, Any] | None = None,
    source: Literal["device", "api", "system"],
) -> None:
    event_type = (
        "session_opened" if action == "attendance_session.started" else "session_closed"
    )
    metadata_json = {
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "entity_label": entity_label,
    }
    safe_changes = {}
    for key, value in (changes or {}).items():
        if key in _SENSITIVE_FIELDS:
            safe_changes[key] = {"changed": True}
        else:
            safe_changes[key] = value
    metadata_json["changes"] = (
        jsonable_encoder(safe_changes) if changes is not None else None
    )

    try:
        async with AsyncSessionLocal() as audit_db:
            audit_db.add(
                AuditLog(
                    actor_user_id=actor_user_id,
                    event_type=event_type,
                    action_source=source,
                    message=f"{action}: {entity_label}"[:255],
                    metadata_json=jsonable_encoder(metadata_json),
                )
            )
            await audit_db.commit()
    except Exception:
        logger.exception("Failed to write audit log for action %s", action)

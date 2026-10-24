from datetime import date, datetime, time, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from helpers.database import async_get_db
from helpers.dependencies import ensure_admin, get_current_user
from Models import AuditLog, User
from Models.schemas.audit_log import AuditEventType, AuditLogPageResponse


router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

_legacy_action = case(
    (AuditLog.event_type == "session_opened", "Session started"),
    (AuditLog.event_type == "session_closed", "Session closed"),
    (AuditLog.event_type == "checkin_success", "Check-in accepted"),
    (AuditLog.event_type == "checkin_failed", "Check-in rejected"),
    (AuditLog.event_type == "fraud_attempt", "Fraud attempt"),
    else_="Unknown event",
)
_legacy_entity_type = case(
    (
        AuditLog.event_type.in_(
            ("checkin_success", "checkin_failed", "fraud_attempt")
        ),
        "attendance_event",
    ),
    else_=None,
)
_action_label = func.coalesce(
    AuditLog.metadata_json["action"].as_string(), _legacy_action
)
_entity_type_label = func.coalesce(
    AuditLog.metadata_json["entity_type"].as_string(), _legacy_entity_type
)


@router.get("", response_model=AuditLogPageResponse)
async def list_audit_logs(
    event_type: AuditEventType | None = Query(default=None),
    action: str | None = Query(default=None, min_length=1, max_length=100),
    entity_type: str | None = Query(default=None, min_length=1, max_length=100),
    actor: str | None = Query(default=None, min_length=1, max_length=120),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(async_get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_admin(current_user)

    filters = []
    if event_type:
        filters.append(AuditLog.event_type == event_type)
    if action:
        filters.append(_action_label == action)
    if entity_type:
        filters.append(_entity_type_label == entity_type)
    if actor:
        if actor.strip().casefold() in {"system/device", "system", "device"}:
            filters.append(AuditLog.actor_user_id.is_(None))
        else:
            try:
                actor_id = UUID(actor)
            except ValueError:
                filters.append(User.full_name.ilike(f"%{actor}%"))
            else:
                filters.append(AuditLog.actor_user_id == actor_id)
    if date_from:
        filters.append(
            AuditLog.created_at
            >= datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        )
    if date_to:
        filters.append(
            AuditLog.created_at
            <= datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        )
    if search:
        filters.append(AuditLog.message.ilike(f"%{search}%"))

    total = await db.scalar(
        select(func.count(AuditLog.id))
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(*filters)
    )
    result = await db.execute(
        select(AuditLog, User.full_name, _action_label)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    items = []
    for audit_log, actor_name, displayed_action in result.all():
        metadata = audit_log.metadata_json or {}
        entity_type_value = metadata.get("entity_type")
        entity_id_value = metadata.get("entity_id")
        entity_label = metadata.get("entity_label")
        is_checkin_event = audit_log.event_type in {
            "checkin_success",
            "checkin_failed",
            "fraud_attempt",
        }
        if not entity_type_value and is_checkin_event:
            entity_type_value = "attendance_event"
        if not entity_id_value:
            entity_id_value = metadata.get("student_id")
        if not entity_label and is_checkin_event:
            entity_label = metadata.get("student_id")

        items.append(
            {
                "id": audit_log.id,
                "created_at": audit_log.created_at,
                "updated_at": audit_log.updated_at,
                "actor_user_id": audit_log.actor_user_id,
                "actor_name": actor_name or "System/Device",
                "event_type": audit_log.event_type,
                "action_source": audit_log.action_source,
                "message": audit_log.message,
                "metadata_json": metadata or None,
                "action": displayed_action,
                "entity_type": entity_type_value,
                "entity_id": str(entity_id_value) if entity_id_value else None,
                "entity_label": entity_label,
            }
        )

    return {
        "items": items,
        "total": total or 0,
        "page": page,
        "page_size": page_size,
    }

from typing import Literal
from uuid import UUID

from pydantic import Field

from Models.schemas.base import ORMModel, TimestampedResponse


AuditEventType = Literal[
    "session_opened",
    "session_closed",
    "checkin_success",
    "checkin_failed",
    "fraud_attempt",
]
AuditActionSource = Literal["device", "api", "system"]


class AuditLogCreate(ORMModel):
    actor_user_id: UUID | None = None
    event_type: AuditEventType
    action_source: AuditActionSource
    message: str = Field(min_length=3, max_length=255)
    metadata_json: dict | None = None


class AuditLogResponse(TimestampedResponse):
    actor_user_id: UUID | None
    event_type: AuditEventType
    action_source: AuditActionSource
    message: str
    metadata_json: dict | None


class AuditLogEntryResponse(AuditLogResponse):
    actor_name: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    entity_label: str | None = None


class AuditLogPageResponse(ORMModel):
    items: list[AuditLogEntryResponse]
    total: int
    page: int
    page_size: int

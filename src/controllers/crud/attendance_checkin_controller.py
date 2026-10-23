from datetime import datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from Models import (
    AttendanceEvent,
    AttendanceSession,
    AuditLog,
    Device,
    Enrollment,
    Student,
)
from Models.schemas.attendance_event import (
    AttendanceCheckInRequest,
    AttendanceEventResponse,
    AttendanceValidationResult,
)
from helpers.ws_manager import ws_manager


class AttendanceCheckInController:
    FACE_MATCH_THRESHOLD = 0.75

    @staticmethod
    async def _append_audit(
        db: AsyncSession,
        *,
        event_type: str,
        message: str,
        metadata_json: dict | None = None,
    ) -> None:
        db.add(
            AuditLog(
                actor_user_id=None,
                event_type=event_type,
                action_source="device",
                message=message,
                metadata_json=metadata_json,
            )
        )

    async def process_checkin(
        self,
        db: AsyncSession,
        payload: AttendanceCheckInRequest,
    ) -> AttendanceValidationResult:
        checked_at = datetime.now(timezone.utc)

        session_stmt = select(AttendanceSession).where(
            AttendanceSession.id == payload.attendance_session_id
        )
        session = (await db.execute(session_stmt)).scalar_one_or_none()
        if not session:
            await self._append_audit(
                db,
                event_type="checkin_failed",
                message="check-in rejected: session not found",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="session not found",
                checked_at=checked_at,
            )

        if payload.section_id != session.section_id:
            await self._append_audit(
                db,
                event_type="fraud_attempt",
                message="check-in rejected: session/section mismatch",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="section does not match the session",
                checked_at=checked_at,
            )

        if (
            not session.is_active
            or checked_at < session.start_time
            or checked_at > session.end_time
        ):
            await self._append_audit(
                db,
                event_type="checkin_failed",
                message="check-in rejected: session not active in current time window",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="session is not active",
                checked_at=checked_at,
            )

        device_exists = await db.scalar(
            select(Device.id).where(Device.id == payload.device_id)
        )
        if not device_exists:
            await self._append_audit(
                db,
                event_type="checkin_failed",
                message="check-in rejected: device not found",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="device not found",
                checked_at=checked_at,
            )

        enrollment_stmt = select(Enrollment).where(
            and_(
                Enrollment.student_id == payload.student_id,
                Enrollment.section_id == session.section_id,
            )
        )
        enrollment = (await db.execute(enrollment_stmt)).scalar_one_or_none()
        if not enrollment:
            await self._append_audit(
                db,
                event_type="fraud_attempt",
                message="check-in rejected: student is not enrolled in section",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="student not enrolled in section",
                checked_at=checked_at,
            )

        if payload.method_used == "FACE" and (
            payload.similarity_score is None
            or payload.similarity_score < self.FACE_MATCH_THRESHOLD
        ):
            await self._append_audit(
                db,
                event_type="fraud_attempt",
                message="check-in rejected: face similarity below threshold",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="face verification failed",
                checked_at=checked_at,
            )

        existing_event = await db.scalar(
            select(AttendanceEvent).where(
                AttendanceEvent.student_id == payload.student_id,
                AttendanceEvent.attendance_session_id
                == payload.attendance_session_id,
            )
        )
        if existing_event is not None and existing_event.final_status != "Absent":
            await self._append_audit(
                db,
                event_type="checkin_failed",
                message="check-in rejected: duplicate record for student/session",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="attendance already recorded for this session",
                checked_at=checked_at,
            )

        if existing_event is not None:
            # The student was marked Absent when the session closed. A late
            # check-in (for example after the session was re-activated) turns
            # that row into Present instead of violating the unique constraint.
            attendance_event = existing_event
            attendance_event.section_id = session.section_id
            attendance_event.device_id = payload.device_id
            attendance_event.method_used = payload.method_used
            attendance_event.final_status = "Present"
        else:
            attendance_event = AttendanceEvent(
                student_id=payload.student_id,
                attendance_session_id=payload.attendance_session_id,
                section_id=session.section_id,
                device_id=payload.device_id,
                method_used=payload.method_used,
                final_status="Present",
            )
            db.add(attendance_event)

        await self._append_audit(
            db,
            event_type="checkin_success",
            message="check-in accepted",
            metadata_json=payload.model_dump(mode="json"),
        )

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            await self._append_audit(
                db,
                event_type="checkin_failed",
                message="check-in rejected: duplicate record for student/session",
                metadata_json=payload.model_dump(mode="json"),
            )
            await db.commit()
            return AttendanceValidationResult(
                accepted=False,
                reason="attendance already recorded for this session",
                checked_at=checked_at,
            )

        await db.refresh(attendance_event)

        student_name = await db.scalar(
            select(Student.full_name).where(Student.id == attendance_event.student_id)
        )
        total_present = (
            await db.scalar(
                select(func.count(func.distinct(AttendanceEvent.student_id))).where(
                    AttendanceEvent.attendance_session_id
                    == attendance_event.attendance_session_id,
                    AttendanceEvent.final_status == "Present",
                )
            )
        ) or 0
        total_students = (
            await db.scalar(
                select(func.count(func.distinct(Enrollment.student_id))).where(
                    Enrollment.section_id == attendance_event.section_id
                )
            )
        ) or 0

        await ws_manager.broadcast(
            attendance_event.attendance_session_id,
            {
                "type": "checkin",
                "student_id": str(attendance_event.student_id),
                "student_name": student_name or "Unknown",
                "method": attendance_event.method_used,
                "status": attendance_event.final_status,
                "timestamp": attendance_event.created_at.isoformat(),
                "total_present": total_present,
                "total_students": total_students,
            },
        )

        return AttendanceValidationResult(
            accepted=True,
            reason="attendance recorded",
            attendance_event=AttendanceEventResponse.model_validate(attendance_event),
            checked_at=checked_at,
        )


attendance_checkin_controller = AttendanceCheckInController()

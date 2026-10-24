from fastapi import APIRouter, Depends
from helpers.config import Settings, get_settings
from helpers.dependencies import get_current_user
from Models import User
from routes.attendance_checkin import router as attendance_checkin_router
from routes.attendance_sessions import router as attendance_sessions_router
from routes.audit_logs import router as audit_logs_router
from routes.auth import router as auth_router
from routes.courses import router as courses_router
from routes.devices import router as devices_router
from routes.reports import router as reports_router
from routes.sections import router as sections_router
from routes.students import router as students_router
from routes.users import router as users_router
from routes.ws import router as ws_router

base_router = APIRouter(tags=["api_v1"], prefix="/api/v1")


@base_router.get("/")
async def welcome(
    app_settings: Settings = Depends(get_settings),
):
    app_name = app_settings.APP_NAME
    app_version = app_settings.APP_VERSION
    return {
        "message": "Welcome to the API",
        "app_name": app_name,
        "app_version": app_version,
    }


base_router.include_router(students_router)
base_router.include_router(users_router)
base_router.include_router(courses_router)
base_router.include_router(sections_router)
base_router.include_router(devices_router)
base_router.include_router(attendance_sessions_router)
base_router.include_router(audit_logs_router)
base_router.include_router(attendance_checkin_router)
base_router.include_router(reports_router)
base_router.include_router(auth_router)
base_router.include_router(ws_router)

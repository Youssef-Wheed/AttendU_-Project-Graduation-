# Student Attendance Report Design

## Goal

Add a per-student attendance report covering every course section in which the
student is enrolled, with course and overall attendance totals, session details,
CSV export, and browser printing. Existing attendance calculations must remain
consistent, and no database schema changes, migrations, data changes, or new
libraries are permitted.

## Backend

Add response models alongside the student schemas for the student identity,
course summaries, session summaries, overall totals, and `generated_at`.
Implement `GET /students/{student_id}/report` in the student routes, guarded by
the same `get_current_user` dependency as the other student routes. Return 404
when the student does not exist.

Use a small, bounded number of set-based queries to load the student's
enrollments, course/section/instructor labels, and ended sessions with that
student's attendance status. Do not issue queries per course or session. Reuse
`src/helpers/attendance_stats.py` and its ended-session, attended-status, and
percentage rules so overall and course figures follow existing attendance
views. Add helper functionality only: do not change or rename existing
functions in `attendance_stats.py`. Ended sessions are those with
`is_active=false` or `end_time<=now`; attended sessions have a `Present` or
`Late` event. Absent is total minus attended, and percentage is rounded to one
decimal place, or `0.0` for zero sessions. The overall percentage is computed
from total attended divided by total ended sessions across all enrolled
courses, not by averaging course percentages; it must match the admin Students
page. In session details, map either `Present` or `Late` to `Present`; sessions
without either status display `Absent`. Use the course Students page standing
thresholds (at least 75%:
`Good standing`; at least 50%: `Needs attention`; otherwise `Critical risk`).
Order courses by course code and sessions by their start time.

Add `present_count` and `total_sessions` to the course-student API response if
they are not already present; do not alter the database schema.

## Frontend and routing

Add a typed client API method and a `StudentReportPage` at
`/students/:id/report` inside the existing protected route and `AppLayout`.
Keep this route distinct from `/students` and `/admin/students`.

The page contains a student identity header; KPI cards for overall percentage,
attended, absent, and course count; and a course table showing course code,
name, section, attended/total, absent, percentage with a progress bar, and a
standing chip. Each course row expands to show session date, title, and
Present/Absent status. Include loading, error/retry, and no-course empty states.
Use existing Midnight Indigo CSS tokens and local fonts, with responsive
styling for both light and dark themes.

Link student names to the report from the course Students page and admin
Students page, and add a Report action to the admin table. On the course
Students page, display `present_count / total_sessions` beneath each
percentage.

## Export and print

Generate CSV in the browser from the loaded report data, with one course row
and corresponding session-detail rows. Prefix the CSV with a UTF-8 BOM so
Excel handles Arabic text correctly. Download using a sanitized
`attendance-report-<student>-<YYYY-MM-DD>.csv` filename.
For every text cell, prefix a single quote when its first character is `=`,
`+`, `-`, or `@` to prevent spreadsheet formula execution.

The Print / Save as PDF action calls `window.print()`. Print CSS hides the
sidebar, topbar, and interactive buttons, sets a white background and black
text, and fits the report table to the page. Do not add a PDF library.

## Verification

- Build the frontend with `npm run build`.
- Restart the backend bound to `0.0.0.0:8000` and request the report for the
  student with RFID `E375AA2A` (Youssef Waheed).
- Compare per-course and total counts with the database and the admin Students
  and course Students pages; the student is expected to be enrolled in three
  courses.
- Do not modify real or seed data, run
  `src/scripts/backfill_absent_events.py`, or change the device endpoints,
  `close_expired_sessions`, idempotent `stop_session`, or
  `insert_absent_events`.
- Leave all changes uncommitted.

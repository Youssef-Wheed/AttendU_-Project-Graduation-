# Instructor administration controls

## Goal and constraints

Give administrators visibility into instructor teaching assignments, safe user
deletion, case-insensitive duplicate-email rejection, and section reassignment
from the Users admin page. Do not change database schema, add migrations or
dependencies, alter authentication behavior, or modify the device attendance
endpoints or protected attendance/session/statistics functions. Preserve audit
logging and do not commit the work.

## Backend

### Teaching summary

Add admin-only `GET /users/{user_id}/teaching`. Return basic user information,
per-section `section_id`, `section_name`, `schedule_time`, `course_id`,
`course_code`, `course_name`, `students_count`, `sessions_count`, and
`last_session_at`, plus totals. Return 404 when the requested user does not
exist. Use set-based aggregate queries rather than a per-section query loop.

The overall totals are `sections_count`, `unique_students` (distinct students
across all of the user's sections), `total_enrollments` (sum of each section's
student count), and `sessions_count`. `last_session_at` is the maximum session
`start_time` for that section and is null when no session exists.

The admin users list also returns a `sections_count` per user so the Users page
can populate its count column without making a request per user.

### User creation and deletion

Before creating an account, compare the submitted email with existing records
using `lower(email)` and return HTTP 409 for a case-insensitive match. Keep the
existing authentication flow unchanged and add no index or schema change.

Before deletion, return HTTP 409 rather than exposing a database integrity
error when the target is the authenticated user, the target is the last
administrator, or the user is referenced by sections or attendance sessions.
Reference-conflict responses include both section and session counts and
explain what must be reassigned or otherwise resolved. Preserve the existing
`user.deleted` audit call for successful deletion, exactly once.

### Section reassignment

The current section PUT schema already accepts `instructor_id`, and its route
logs one `section.updated` audit entry when the payload changes a value.
Continue using that route without adding duplicate audit logic. Current
validation permits both `admin` and `instructor` users to own a section, so
both roles appear as reassignment choices.

## Frontend

Add a Sections count column to the Users admin table. Selecting a user opens a
Teaching drawer with their sections and summary. Show the distinct overall
student total under the label “Unique students”; section student counts remain
per-section enrollment counts. List course code/name, section, schedule,
students, sessions, and last session for each section.

Each section provides a reassignment action. Submit the current `course_id`,
`section_name`, and exact stored `schedule_time` with the new `instructor_id`,
so only the instructor changes. Refresh the teaching view and list counts on
success.

Disable the delete action for the signed-in user. Present friendly explanations
for self-delete, last-admin, section-reference, session-reference, and duplicate
email 409 responses. Provide loading, error, and empty states. Use existing
theme tokens for dark/light compatibility.

## Verification

Create test records through the API and verify:

- Teaching details and totals, including distinct students and enrollments.
- A referenced instructor cannot be deleted, with section/session counts in 409.
- Self-deletion and deletion of the last admin return 409.
- An unreferenced user can be deleted and produces exactly one deletion audit
  record.
- Reassignment succeeds, produces exactly one update audit record, and leaves
  `course_id` and exact `schedule_time` unchanged.
- A case-only email duplicate returns 409.
- Temporary records are removed.
- The four hardware endpoint responses (`ping`, `active-session`, `checkin`,
  `rfid-face-checkin`) are identical before and after the changes.
- `npm run build` succeeds.

No database migrations, schema changes, additional libraries, changes to the
protected device/session/check-in/statistics code, or git commit are included.

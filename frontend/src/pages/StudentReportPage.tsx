import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { useTopbarSetter } from '../context/TopbarContext'
import { getStudentReport } from '../features/students/api/studentReportApi'
import type {
  StudentReportCourse,
  StudentReportResponse,
} from '../features/students/types/studentReportTypes'
import './StudentReportPage.css'

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value))

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))

const csvCell = (value: string | number | null | undefined): string => {
  let serialized = String(value ?? '')
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    serialized = `'${value}`
  }

  const escaped = serialized.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

const exportReportCsv = (report: StudentReportResponse) => {
  const headers = [
    'row_type',
    'student_name',
    'student_email',
    'rfid_uid',
    'course_code',
    'course_name',
    'section',
    'instructor',
    'attended',
    'absent',
    'total_sessions',
    'percentage',
    'standing',
    'session_date',
    'session_title',
    'session_status',
  ]
  const rows: (string | number | null)[][] = []

  report.courses.forEach((course) => {
    rows.push([
      'course',
      report.student.full_name,
      report.student.email,
      report.student.rfid_uid,
      course.course_code,
      course.course_name,
      course.section_name,
      course.instructor_name,
      course.attended,
      course.absent,
      course.total_sessions,
      course.percentage.toFixed(1),
      course.status,
      null,
      null,
      null,
    ])

    course.sessions.forEach((session) => {
      rows.push([
        'session',
        report.student.full_name,
        report.student.email,
        report.student.rfid_uid,
        course.course_code,
        course.course_name,
        course.section_name,
        course.instructor_name,
        null,
        null,
        null,
        null,
        null,
        formatDate(session.date),
        session.title,
        session.status,
      ])
    })
  })

  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const studentName = report.student.full_name
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'student'
  const date = new Date(report.generated_at).toISOString().slice(0, 10)

  anchor.href = objectUrl
  anchor.download = `attendance-report-${studentName}-${date}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

const getStandingTone = (standing: StudentReportCourse['status']) => {
  if (standing === 'Good standing') return 'good'
  if (standing === 'Needs attention') return 'warning'
  return 'critical'
}

export default function StudentReportPage() {
  const { id } = useParams<{ id: string }>()
  const setTopbar = useTopbarSetter()
  const [loadState, setLoadState] = useState<{
    studentId: string
    report?: StudentReportResponse
    error?: string
  } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    () => new Set(),
  )
  const report = loadState && loadState.studentId === id
    ? loadState.report ?? null
    : null
  const error = loadState && loadState.studentId === id
    ? loadState.error ?? null
    : null
  const isLoading = Boolean(id) && loadState?.studentId !== id
  const displayError = id ? error : 'Student identifier is missing.'

  useEffect(() => {
    setTopbar({
      kicker: 'Students',
      title: 'Attendance report',
      description: 'Course-by-course attendance and session history.',
    })
  }, [setTopbar])

  useEffect(() => {
    if (!id) return

    let isActive = true

    void getStudentReport(id)
      .then((result) => {
        if (isActive) {
          setLoadState({ studentId: id, report: result })
          setExpandedCourses(new Set())
        }
      })
      .catch((requestError: unknown) => {
        if (isActive) {
          setLoadState({
            studentId: id,
            error: requestError instanceof Error
              ? requestError.message
              : 'Failed to load the student attendance report.',
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [id, reloadToken])

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((current) => {
      const next = new Set(current)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
  }

  return (
    <section className="ui-surface ui-section student-report-page">
      <PageHeader
        eyebrow="Student report"
        title={report?.student.full_name ?? 'Attendance report'}
        description="A complete attendance overview across the student's enrolled courses."
        actions={
          <div className="student-report__actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={!report || isLoading}
              onClick={() => report && exportReportCsv(report)}
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!report || isLoading}
              onClick={() => window.print()}
            >
              Print / Save as PDF
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="student-report__state" role="status">
          <span className="student-report__spinner" aria-hidden="true" />
          <p>Loading attendance report…</p>
        </div>
      ) : null}

      {!isLoading && displayError ? (
        <section className="student-report__state student-report__state--error" role="alert">
          <h2>Unable to load report</h2>
          <p>{displayError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoadState(null)
              setReloadToken((current) => current + 1)
            }}
          >
            Retry
          </Button>
        </section>
      ) : null}

      {!isLoading && report ? (
        <>
          <section className="student-report__identity" aria-label="Student information">
            <div className="student-report__avatar" aria-hidden="true">
              {report.student.full_name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? '')
                .join('')}
            </div>
            <div className="student-report__identity-copy">
              <h2>{report.student.full_name}</h2>
              <p>{report.student.email}</p>
              <span>RFID {report.student.rfid_uid}</span>
            </div>
            <p className="student-report__generated">
              Generated {formatDate(report.generated_at)}
            </p>
          </section>

          <section className="student-report__metrics" aria-label="Attendance totals">
            <article className="student-report__metric student-report__metric--primary">
              <span>Overall attendance</span>
              <strong>{report.totals.percentage.toFixed(1)}%</strong>
            </article>
            <article className="student-report__metric">
              <span>Attended</span>
              <strong>{report.totals.attended}</strong>
              <small>sessions</small>
            </article>
            <article className="student-report__metric">
              <span>Absent</span>
              <strong>{report.totals.absent}</strong>
              <small>sessions</small>
            </article>
            <article className="student-report__metric">
              <span>Courses</span>
              <strong>{report.totals.courses}</strong>
              <small>enrolled</small>
            </article>
          </section>

          {report.courses.length === 0 ? (
            <section className="student-report__empty">
              <h2>No enrolled courses</h2>
              <p>This student is not currently enrolled in any course sections.</p>
            </section>
          ) : (
            <div className="student-report__table-wrap">
              <table className="student-report__table">
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Section</th>
                    <th scope="col">Attended</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Attendance</th>
                    <th scope="col">Status</th>
                    <th scope="col">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.courses.map((course) => {
                    const isExpanded = expandedCourses.has(course.course_id)
                    const tone = getStandingTone(course.status)

                    return (
                      <ReportCourseRows
                        key={course.course_id}
                        course={course}
                        tone={tone}
                        isExpanded={isExpanded}
                        onToggle={() => toggleCourse(course.course_id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}

function ReportCourseRows({
  course,
  tone,
  isExpanded,
  onToggle,
}: {
  course: StudentReportCourse
  tone: string
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="student-report__course-row">
        <th scope="row">
          <span className="student-report__course-code">{course.course_code}</span>
          <strong>{course.course_name}</strong>
          <small>{course.instructor_name}</small>
        </th>
        <td>{course.section_name}</td>
        <td>{course.attended} / {course.total_sessions}</td>
        <td>{course.absent}</td>
        <td>
          <div
            className={`student-report__attendance student-report__attendance--${tone}`}
            aria-label={`${course.percentage.toFixed(1)} percent attendance`}
          >
            <strong>{course.percentage.toFixed(1)}%</strong>
            <span className="student-report__progress">
              <span style={{ width: `${clampPercentage(course.percentage)}%` }} />
            </span>
          </div>
        </td>
        <td>
          <span className={`student-report__status student-report__status--${tone}`}>
            {course.status}
          </span>
        </td>
        <td>
          <button
            type="button"
            className="student-report__toggle"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} sessions for ${course.course_name}`}
          >
            {isExpanded ? 'Hide' : 'View'} ({course.sessions.length})
          </button>
        </td>
      </tr>
      <tr
        className={`student-report__sessions-row${isExpanded ? ' student-report__sessions-row--expanded' : ''}`}
        aria-hidden={!isExpanded}
      >
        <td colSpan={7}>
          <div className="student-report__sessions">
            <h3>{course.course_code} sessions</h3>
            {course.sessions.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Session</th>
                    <th scope="col">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {course.sessions.map((session) => (
                    <tr key={session.session_id}>
                      <td>{formatDate(session.date)}</td>
                      <td>{session.title}</td>
                      <td>
                        <span className={`student-report__session-status student-report__session-status--${session.status.toLowerCase()}`}>
                          {session.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No ended sessions for this course.</p>
            )}
          </div>
        </td>
      </tr>
    </>
  )
}

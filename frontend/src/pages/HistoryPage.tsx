import { useEffect, useMemo, useState } from 'react'

import Button from '../components/ui/Button'
import MetricCard from '../components/ui/MetricCard'
import MetricCardSkeleton from '../components/ui/MetricCardSkeleton'
import PageHeader from '../components/ui/PageHeader'
import TableSkeleton from '../components/ui/TableSkeleton'
import { getAttendanceSessionsHistory } from '../features/attendance/api/attendanceSessionApi'
import type { AttendanceSessionHistoryResponse } from '../features/attendance/types/attendanceSessionTypes'
import { getCourses } from '../features/courses/api/courseApi'
import type { CourseResponse } from '../features/courses/types/courseTypes'
import { exportToCSV } from '../utils/exportToCSV'
import { useTopbarSetter } from '../context/TopbarContext'
import './HistoryPage.css'

const IconCalendar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></svg>
)

const IconPercent = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
)

const IconStar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3 12 2" /></svg>
)

const IconTrendDown = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>
)

type DatePreset = 'last7' | 'last30' | 'all' | null
type AttendanceTone = 'success' | 'warning' | 'danger'

const formatSessionDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPresetRange = (days: number) => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1))

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  }
}

const toStartOfDayIso = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined

const toEndOfDayIso = (value: string): string | undefined =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined

const getSessionPercentage = (session: AttendanceSessionHistoryResponse): number | null => {
  const percentage = session.attendance_percentage ?? session.percentage
  if (typeof percentage === 'number' && Number.isFinite(percentage)) {
    return percentage
  }

  const presentCount = session.present_count ?? session.present
  const totalCount = session.total_students
  if (
    typeof presentCount === 'number' &&
    Number.isFinite(presentCount) &&
    typeof totalCount === 'number' &&
    Number.isFinite(totalCount) &&
    totalCount > 0
  ) {
    return (presentCount / totalCount) * 100
  }

  return null
}

const getPresentCount = (session: AttendanceSessionHistoryResponse): number | null => {
  const presentCount = session.present_count ?? session.present
  return typeof presentCount === 'number' && Number.isFinite(presentCount) ? presentCount : null
}

const getAbsentCount = (session: AttendanceSessionHistoryResponse): number | null => {
  const presentCount = getPresentCount(session)
  const totalCount = session.total_students

  if (
    presentCount === null ||
    typeof totalCount !== 'number' ||
    !Number.isFinite(totalCount)
  ) {
    return null
  }

  return Math.max(totalCount - presentCount, 0)
}

const getAttendanceTone = (percentage: number): AttendanceTone => {
  if (percentage >= 75) {
    return 'success'
  }

  if (percentage >= 50) {
    return 'warning'
  }

  return 'danger'
}

const getBestDayLabel = (sessions: AttendanceSessionHistoryResponse[]) => {
  let bestDay = 'N/A'
  let bestScore = -1

  sessions.forEach((session) => {
    const percentage = getSessionPercentage(session)
    const parsedDate = new Date(session.start_time)
    if (percentage === null || Number.isNaN(parsedDate.getTime())) {
      return
    }

    if (percentage > bestScore) {
      bestScore = percentage
      bestDay = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(parsedDate)
    }
  })

  return bestDay
}

const getLowestAttendanceSession = (sessions: AttendanceSessionHistoryResponse[]) => {
  let lowestSession: AttendanceSessionHistoryResponse | null = null
  let lowestPercentage = Number.POSITIVE_INFINITY

  for (const session of sessions) {
    const percentage = getSessionPercentage(session)
    if (percentage !== null && percentage < lowestPercentage) {
      lowestPercentage = percentage
      lowestSession = session
    }
  }

  return lowestSession ? { session: lowestSession, percentage: lowestPercentage } : null
}

const getStatusLabel = (session: AttendanceSessionHistoryResponse) => {
  if (session.status) {
    return session.status
  }
  return session.is_active ? 'Active' : 'Completed'
}

const getStatusClassName = (status: string) => {
  const normalizedStatus = status.trim().toLowerCase()
  if (normalizedStatus === 'active') {
    return 'history-page__status--active'
  }

  if (normalizedStatus === 'completed' || normalizedStatus === 'closed') {
    return 'history-page__status--completed'
  }

  return 'history-page__status--neutral'
}

const downloadSessionsCsv = (sessions: AttendanceSessionHistoryResponse[]) => {
  const datePart = new Date().toISOString().slice(0, 10)
  const exportRows = sessions.map((session) => {
    const percentage = getSessionPercentage(session)
    const presentCount = getPresentCount(session)
    const absentCount = getAbsentCount(session)
    const totalCount = session.total_students

    return {
      date: formatSessionDate(session.start_time),
      title: session.title,
      course: session.course_name
        ? `${session.course_code ?? ''} ${session.course_name}`.trim()
        : session.course_code ?? '',
      section: session.section_name ?? session.section ?? session.section_id,
      present: presentCount ?? '',
      absent: absentCount ?? '',
      total: typeof totalCount === 'number' ? totalCount : '',
      percentage: percentage === null ? '' : percentage.toFixed(1),
      status: getStatusLabel(session),
    }
  })

  exportToCSV(exportRows, `attendance-sessions-history-${datePart}`)
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<AttendanceSessionHistoryResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [courseCodeFilter, setCourseCodeFilter] = useState('')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [courses, setCourses] = useState<CourseResponse[]>([])
  const [coursesError, setCoursesError] = useState<string | null>(null)
  const setTopbar = useTopbarSetter()

  useEffect(() => {
    setTopbar({
      kicker: 'History',
      title: 'Attendance Sessions History',
      description: 'Review historical attendance sessions with course and date filters.',
    })
  }, [setTopbar])

  useEffect(() => {
    let isActive = true

    const loadCourses = async () => {
      try {
        const result = await getCourses()
        if (isActive) {
          setCourses(result)
          setCoursesError(null)
        }
      } catch {
        if (isActive) {
          setCourses([])
          setCoursesError('Course list unavailable.')
        }
      }
    }

    void loadCourses()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await getAttendanceSessionsHistory({
          course_code: courseCodeFilter.trim() || undefined,
          start_date: toStartOfDayIso(startDateFilter),
          end_date: toEndOfDayIso(endDateFilter),
        })
        if (!isActive) {
          return
        }
        setSessions(response)
      } catch (requestError) {
        if (!isActive) {
          return
        }
        setError(requestError instanceof Error ? requestError.message : 'Failed to load attendance history.')
        setSessions([])
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      isActive = false
    }
  }, [courseCodeFilter, endDateFilter, reloadToken, startDateFilter])

  const stats = useMemo(() => {
    let totalPresent = 0
    let totalExpected = 0

    sessions.forEach((session) => {
      const presentCount = getPresentCount(session)
      const totalCount = session.total_students

      if (
        presentCount !== null &&
        typeof totalCount === 'number' &&
        Number.isFinite(totalCount) &&
        totalCount > 0
      ) {
        totalPresent += presentCount
        totalExpected += totalCount
      }
    })

    const averageAttendance = totalExpected > 0 ? (totalPresent / totalExpected) * 100 : 0
    const lowestSession = getLowestAttendanceSession(sessions)

    return {
      totalSessions: sessions.length,
      averageAttendance,
      bestDay: getBestDayLabel(sessions),
      lowestSession,
    }
  }, [sessions])

  const hasActiveFilters = Boolean(startDateFilter || endDateFilter || courseCodeFilter)

  const clearFilters = () => {
    setStartDateFilter('')
    setEndDateFilter('')
    setCourseCodeFilter('')
    setDatePreset('all')
  }

  const applyPreset = (preset: Exclude<DatePreset, null>) => {
    setDatePreset(preset)

    if (preset === 'all') {
      setStartDateFilter('')
      setEndDateFilter('')
      return
    }

    const range = getPresetRange(preset === 'last7' ? 7 : 30)
    setStartDateFilter(range.start)
    setEndDateFilter(range.end)
  }

  return (
    <div className="history-page">
      <div className="ui-stat-grid">
        {isLoading ? (
          <MetricCardSkeleton count={4} />
        ) : (
          <>
            <MetricCard label="Total sessions" value={stats.totalSessions} icon={<IconCalendar />} />
            <MetricCard
              label="Average attendance"
              value={`${stats.averageAttendance.toFixed(1)}%`}
              icon={<IconPercent />}
              hint="Total present ÷ total expected students across listed sessions."
            />
            <MetricCard label="Best day" value={stats.bestDay} icon={<IconStar />} />
            <MetricCard
              label="Lowest attendance session"
              value={stats.lowestSession?.session.title ?? 'N/A'}
              icon={<IconTrendDown />}
              hint={
                stats.lowestSession
                  ? `${stats.lowestSession.percentage.toFixed(1)}% · ${formatSessionDate(stats.lowestSession.session.start_time)}`
                  : 'No sessions to compare yet.'
              }
            />
          </>
        )}
      </div>

      <section className="ui-surface ui-section">
        <PageHeader
          eyebrow="Filters"
          title="Session filters"
          description="Filter attendance sessions by course and date range."
        />

        <div className="history-page__filters">
          <label className="ui-field">
            <span className="ui-field__label">Start date</span>
            <input
              type="date"
              className="ui-input"
              value={startDateFilter}
              onChange={(event) => {
                setStartDateFilter(event.target.value)
                setDatePreset(null)
              }}
            />
          </label>

          <label className="ui-field">
            <span className="ui-field__label">End date</span>
            <input
              type="date"
              className="ui-input"
              value={endDateFilter}
              onChange={(event) => {
                setEndDateFilter(event.target.value)
                setDatePreset(null)
              }}
            />
          </label>

          <label className="ui-field">
            <span className="ui-field__label">Course</span>
            <select
              className="ui-select"
              value={courseCodeFilter}
              onChange={(event) => setCourseCodeFilter(event.target.value)}
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.course_code}>
                  {course.course_code} · {course.course_name}
                </option>
              ))}
            </select>
            {coursesError ? (
              <span className="ui-field__hint" role="status">{coursesError}</span>
            ) : null}
          </label>

          <div className="history-page__filter-actions">
            <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>

          <div className="history-page__presets" role="group" aria-label="Quick date presets">
            <span className="history-page__presets-label">Quick range</span>
            <button
              type="button"
              className={`history-page__preset${datePreset === 'last7' ? ' history-page__preset--active' : ''}`}
              onClick={() => applyPreset('last7')}
              aria-pressed={datePreset === 'last7'}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className={`history-page__preset${datePreset === 'last30' ? ' history-page__preset--active' : ''}`}
              onClick={() => applyPreset('last30')}
              aria-pressed={datePreset === 'last30'}
            >
              Last 30 days
            </button>
            <button
              type="button"
              className={`history-page__preset${datePreset === 'all' ? ' history-page__preset--active' : ''}`}
              onClick={() => applyPreset('all')}
              aria-pressed={datePreset === 'all'}
            >
              All
            </button>
          </div>
        </div>
      </section>

      <section className="ui-surface ui-section">
        <PageHeader
          eyebrow="Sessions"
          title="Attendance sessions table"
          description="Track attendance outcomes per session, course, and section."
          actions={(
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading || sessions.length === 0}
              onClick={() => downloadSessionsCsv(sessions)}
            >
              Export CSV
            </Button>
          )}
        />

        {error ? (
          <section className="ui-alert ui-alert--error" role="alert">
            <p className="ui-alert__content">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
              Retry
            </Button>
          </section>
        ) : null}

        {!error && isLoading ? (
          <div className="history-page__table-shell" style={{ marginTop: 'var(--space-5)' }}>
            <TableSkeleton columns={9} rows={7} />
          </div>
        ) : null}

        {!error && !isLoading && sessions.length === 0 ? (
          <section className="ui-empty" style={{ marginTop: 'var(--space-5)' }}>
            <h3>{hasActiveFilters ? 'No sessions match these filters' : 'No attendance sessions yet'}</h3>
            <p>
              {hasActiveFilters
                ? 'Try widening the date range, choosing another course, or clearing the filters.'
                : 'Attendance sessions will appear here once they have been recorded.'}
            </p>
            {hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </section>
        ) : null}

        {!error && !isLoading && sessions.length > 0 ? (
          <div className="history-page__table-shell">
            <table className="history-page__table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Session title</th>
                  <th scope="col">Course</th>
                  <th scope="col">Section</th>
                  <th scope="col" className="history-page__cell-number">Present</th>
                  <th scope="col" className="history-page__cell-number">Absent</th>
                  <th scope="col" className="history-page__cell-number">Total</th>
                  <th scope="col">Attendance %</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const percentage = getSessionPercentage(session)
                  const presentCount = getPresentCount(session)
                  const absentCount = getAbsentCount(session)
                  const totalCount = session.total_students
                  const status = getStatusLabel(session)
                  const tone = percentage === null ? null : getAttendanceTone(percentage)
                  const clampedPercentage = percentage === null ? 0 : Math.min(Math.max(percentage, 0), 100)
                  const courseName = session.course_name?.trim()
                  const sectionLabel = session.section_name ?? session.section ?? session.section_id

                  return (
                    <tr key={session.id}>
                      <td>{formatSessionDate(session.start_time)}</td>
                      <td className="history-page__cell-title">{session.title}</td>
                      <td>
                        <div className="history-page__course">
                          {session.course_code ? (
                            <span className="history-page__course-code">{session.course_code}</span>
                          ) : null}
                          {courseName ? (
                            <span className="history-page__course-name">{courseName}</span>
                          ) : session.course_code ? null : (
                            <span className="history-page__course-name">—</span>
                          )}
                        </div>
                      </td>
                      <td>{sectionLabel || '—'}</td>
                      <td className="history-page__cell-number">{presentCount ?? '-'}</td>
                      <td className="history-page__cell-number">{absentCount ?? '-'}</td>
                      <td className="history-page__cell-number">
                        {typeof totalCount === 'number' ? totalCount : '-'}
                      </td>
                      <td>
                        {percentage === null || tone === null ? (
                          <span className="history-page__attendance-empty">-</span>
                        ) : (
                          <div className="history-page__attendance">
                            <span className={`history-page__attendance-chip history-page__attendance-chip--${tone}`}>
                              {percentage.toFixed(1)}%
                            </span>
                            <div
                              className="history-page__progress"
                              role="progressbar"
                              aria-label="Attendance percentage"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(clampedPercentage)}
                            >
                              <span
                                className={`history-page__progress-fill history-page__progress-fill--${tone}`}
                                style={{ width: `${clampedPercentage}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`ui-badge history-page__status ${getStatusClassName(status)}`}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

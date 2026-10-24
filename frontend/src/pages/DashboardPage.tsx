import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import MetricCard from '../components/ui/MetricCard'
import MetricCardSkeleton from '../components/ui/MetricCardSkeleton'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { useCourses } from '../hooks/useCourses'
import { authStore } from '../store/authStore'
import { useTopbarSetter } from '../context/TopbarContext'
import {
  IconAlertCircle,
  IconCourse,
  IconPlus,
  IconStudents,
  IconTimer,
  IconUsers,
} from '../components/ui/Icons'
import { getStudents } from '../features/admin/api/studentsAdminApi'
import type { StudentApiResponse } from '../features/admin/types/adminApiTypes'
import { getAttendanceSessionsHistory } from '../features/attendance/api/attendanceSessionApi'
import type { AttendanceSessionHistoryResponse } from '../features/attendance/types/attendanceSessionTypes'
import './DashboardPage.css'

const SKELETON_COUNT = 6
const AT_RISK_THRESHOLD = 75
const RECENT_SESSION_LIMIT = 5
const METRICS_FETCH_LIMIT = 200

const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
)

const IconArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
)

const IconPercent = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
)

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

const formatSessionDate = (value: string): string => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = authStore.getUser()
  const [searchQuery, setSearchQuery] = useState('')
  const { courses, sectionCounts, isLoading, error, refetch } = useCourses(searchQuery)
  const [students, setStudents] = useState<StudentApiResponse[]>([])
  const [sessions, setSessions] = useState<AttendanceSessionHistoryResponse[]>([])
  const [isMetricsLoading, setIsMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const setTopbar = useTopbarSetter()

  const firstName = user?.full_name?.split(' ')[0] ?? 'User'

  useEffect(() => {
    let isActive = true

    const loadMetrics = async () => {
      setIsMetricsLoading(true)
      setMetricsError(null)

      try {
        const [studentResult, sessionResult] = await Promise.all([
          getStudents(0, METRICS_FETCH_LIMIT),
          getAttendanceSessionsHistory({ limit: METRICS_FETCH_LIMIT }),
        ])

        if (!isActive) return

        setStudents(studentResult)
        setSessions(sessionResult)
      } catch (requestError) {
        if (!isActive) return
        setStudents([])
        setSessions([])
        setMetricsError(
          requestError instanceof Error ? requestError.message : 'Failed to load dashboard metrics.',
        )
      } finally {
        if (isActive) setIsMetricsLoading(false)
      }
    }

    void loadMetrics()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    setTopbar({
      kicker: 'Dashboard',
      title: `Welcome back, ${firstName}`,
      actions: (
        <Button
          variant="primary"
          leadingIcon={<IconPlus />}
          onClick={() => navigate('/session')}
        >
          Start session
        </Button>
      ),
    })
  }, [setTopbar, firstName, navigate])

  const metrics = useMemo(() => {
    const percentages = sessions
      .map((session) => getSessionPercentage(session))
      .filter((value): value is number => value !== null)

    const averageAttendance = percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : 0

    const atRisk = students.filter(
      (student) => (student.attendance_rate ?? 0) < AT_RISK_THRESHOLD,
    ).length

    return {
      studentCount: students.length,
      sessionCount: sessions.length,
      averageAttendance,
      atRisk,
    }
  }, [sessions, students])

  const recentSessions = useMemo(
    () => sessions.slice(0, RECENT_SESSION_LIMIT),
    [sessions],
  )

  return (
    <>
      <div className="ui-stat-grid">
        {isMetricsLoading ? (
          <MetricCardSkeleton count={4} />
        ) : (
          <>
            <MetricCard label="Students" value={metrics.studentCount} icon={<IconStudents size={22} />} />
            <MetricCard label="Sessions" value={metrics.sessionCount} icon={<IconTimer size={22} />} />
            <MetricCard
              label="Average attendance"
              value={`${metrics.averageAttendance.toFixed(1)}%`}
              icon={<IconPercent />}
            />
            <MetricCard
              label="At-risk students"
              value={metrics.atRisk}
              icon={<IconAlertCircle size={22} />}
            />
          </>
        )}
      </div>

      {metricsError ? (
        <section className="ui-alert ui-alert--error" role="alert">
          <p className="ui-alert__content">{metricsError}</p>
        </section>
      ) : null}

      <section className="ui-surface ui-section dashboard-recent">
        <PageHeader
          eyebrow="Activity"
          title="Recent sessions"
          description="The latest attendance windows across your courses."
          actions={(
            <Button variant="secondary" size="sm" onClick={() => navigate('/history')}>
              View all
            </Button>
          )}
        />

        {isMetricsLoading ? (
          <div className="dashboard-recent-list dashboard-recent-list--loading" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="dashboard-recent-item dashboard-recent-item--skeleton">
                <span className="ui-skeleton-line" style={{ width: '2.75rem', height: '2.75rem' }} />
                <span className="ui-skeleton-line" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
        ) : null}

        {!isMetricsLoading && recentSessions.length === 0 ? (
          <section className="ui-empty">
            <h3>No sessions yet</h3>
            <p>Start a session to see recent attendance activity here.</p>
          </section>
        ) : null}

        {!isMetricsLoading && recentSessions.length > 0 ? (
          <ul className="dashboard-recent-list">
            {recentSessions.map((session) => {
              const percentage = getSessionPercentage(session)
              const isHealthy = percentage !== null && percentage >= AT_RISK_THRESHOLD
              const status = session.status ?? (session.is_active ? 'Active' : 'Completed')

              return (
                <li key={session.id} className="dashboard-recent-item">
                  <div className="dashboard-recent-item__main">
                    <span className="dashboard-recent-item__icon" aria-hidden="true">
                      <IconTimer size={20} />
                    </span>
                    <div className="dashboard-recent-item__copy">
                      <p className="dashboard-recent-item__title">{session.title}</p>
                      <p className="dashboard-recent-item__meta">
                        {session.course_name ?? 'Course'}
                        {session.course_code ? ` · ${session.course_code}` : ''}
                        {session.section_name ? ` · ${session.section_name}` : ''}
                        <span className={`dashboard-recent-item__status ${status.toLowerCase() === 'active' ? 'is-active' : ''}`}>
                          {status}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="dashboard-recent-item__side">
                    <span className="dashboard-recent-item__date">{formatSessionDate(session.start_time)}</span>
                    <span className={`ui-badge ${percentage === null ? '' : isHealthy ? 'ui-badge--success' : 'ui-badge--danger'}`}>
                      {percentage === null ? 'No data' : `${Math.round(percentage)}%`}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      <section className="ui-surface ui-section">
        <PageHeader
          eyebrow="Courses"
          title="Course directory"
          description="Search by course name or code. Results stay scoped to the courses available in your role."
        />

        <div className="dashboard-toolbar">
          <div className="ui-search">
            <span className="ui-search__icon" aria-hidden="true">
              <IconSearch />
            </span>
            <input
              type="search"
              className="ui-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search courses by name or code"
            />
          </div>
        </div>

        {error ? (
          <section className="ui-alert ui-alert--error" role="alert">
            <p className="ui-alert__content">{error}</p>
            <Button variant="secondary" size="sm" onClick={refetch}>
              Retry
            </Button>
          </section>
        ) : null}

        {!error && isLoading ? (
          <div className="ui-loading-grid">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="ui-skeleton-card">
                <span className="ui-skeleton-line" style={{ width: '2.75rem', height: '2.75rem' }} />
                <span className="ui-skeleton-line" style={{ width: '70%' }} />
                <span className="ui-skeleton-line" style={{ width: '40%' }} />
                <span className="ui-skeleton-line" style={{ width: '100%', height: '1px', marginTop: 'auto' }} />
              </div>
            ))}
          </div>
        ) : null}

        {!error && !isLoading && courses.length === 0 ? (
          <section className="ui-empty">
            <h3>No courses found</h3>
            <p>Try a different search term or clear the filter to see everything available to you.</p>
          </section>
        ) : null}

        {!error && !isLoading && courses.length > 0 ? (
          <div className="dashboard-course-grid">
            {courses.map((course, index) => (
              <button
                key={course.id}
                type="button"
                className={`dashboard-course-card animate-fade-up stagger-${index % 5}`}
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                <div className="dashboard-course-card__header">
                  <div className="dashboard-course-card__icon" aria-hidden="true">
                    <IconCourse />
                  </div>
                  <span className="ui-badge">{course.course_code}</span>
                </div>

                <div className="dashboard-course-card__body">
                  <h3>{course.course_name}</h3>
                  <p>Open course analytics, review attendance summaries, and inspect weekly and monthly trends.</p>
                </div>

                <div className="dashboard-course-card__footer">
                  <span className="dashboard-course-card__meta">
                    <IconUsers />
                    {sectionCounts[course.id] ?? 0} sections
                  </span>
                  <span className="dashboard-course-card__cta">
                    Open analytics
                    <IconArrowRight />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  )
}

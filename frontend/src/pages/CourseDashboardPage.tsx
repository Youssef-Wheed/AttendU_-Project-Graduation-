import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import MetricCard from '../components/ui/MetricCard'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import {
  getCourse,
  getCourseDashboard,
  type CourseDashboardResponse,
} from '../features/courses/api/courseApi'
import type { AttendanceSummary } from '../features/courses/types/courseTypes'
import { useTopbarSetter } from '../context/TopbarContext'
import { useTheme } from '../context/ThemeContext'
import './CourseDashboardPage.css'

type SummaryRange = 'weekly' | 'monthly'

const IconUsers = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
)

const IconCheckCircle = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
)

const IconXCircle = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
)

const IconPercent = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
)

const formatSummaryPeriod = (value: string): string => {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export default function CourseDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CourseDashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courseLabel, setCourseLabel] = useState<string | null>(null)
  const [range, setRange] = useState<SummaryRange>('weekly')
  const isMissingCourseId = !id
  const setTopbar = useTopbarSetter()
  const { theme } = useTheme()
  const isDarkTheme = theme === 'dark'
  const chartColors = {
    grid: isDarkTheme ? 'rgba(148, 163, 184, 0.18)' : 'rgba(71, 85, 105, 0.16)',
    tick: isDarkTheme ? '#98a6c4' : '#51607a',
    text: isDarkTheme ? '#e7ecf7' : '#0f172a',
    present: isDarkTheme ? '#34d399' : '#15803d',
    absent: isDarkTheme ? '#fb7185' : '#dc2626',
    percentage: isDarkTheme ? '#7c8fff' : '#3b5bdb',
    cursor: isDarkTheme ? 'rgba(124, 143, 255, 0.08)' : 'rgba(59, 91, 219, 0.06)',
  }

  useEffect(() => {
    if (!id) {
      return
    }

    let isActive = true

    const loadCourse = async () => {
      try {
        const course = await getCourse(id)
        if (isActive) {
          setCourseLabel(`${course.course_name} · ${course.course_code}`)
        }
      } catch {
        if (isActive) setCourseLabel(null)
      }
    }

    void loadCourse()

    return () => {
      isActive = false
    }
  }, [id])

  useEffect(() => {
    setTopbar({
      kicker: 'Analytics',
      title: 'Course analytics',
      description: id
        ? `Attendance trend reporting for ${courseLabel ?? 'this course'}.`
        : 'Attendance trend reporting for the selected course.',
      actions: (
        <>
          {id ? (
            <Button variant="secondary" onClick={() => navigate(`/courses/${id}/students`)}>
              View students
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back to courses
          </Button>
        </>
      ),
    })
  }, [setTopbar, id, navigate, courseLabel])

  useEffect(() => {
    if (!id) {
      return
    }

    let isActive = true

    const loadDashboard = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await getCourseDashboard(id)

        if (isActive) {
          setData(result)
        }
      } catch (requestError) {
        if (isActive) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load dashboard.')
          setData(null)
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      isActive = false
    }
  }, [id])

  const summaries: AttendanceSummary[] = data
    ? range === 'weekly'
      ? data.weekly_summaries
      : data.monthly_summaries
    : []
  const hasTrend = summaries.length >= 2
  const singlePeriod = summaries.length === 1 ? summaries[0] : null

  return (
    <section className="ui-surface ui-section course-dashboard-overview">
      <PageHeader
        eyebrow="Performance"
        title={courseLabel ?? 'Attendance snapshot'}
        description="Track attendance counts and compare weekly and monthly performance without switching layouts or context."
      />

      {isMissingCourseId ? (
        <section className="ui-alert ui-alert--error" role="alert">
          <p className="ui-alert__content">Course identifier is missing.</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard')}>
            Return to dashboard
          </Button>
        </section>
      ) : null}

      {error ? (
        <section className="ui-alert ui-alert--error" role="alert">
          <p className="ui-alert__content">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard')}>
            Return to dashboard
          </Button>
        </section>
      ) : null}

      {!isMissingCourseId && isLoading ? (
        <div className="ui-loading-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="ui-skeleton-card">
              <span className="ui-skeleton-line" style={{ width: '2.75rem', height: '2.75rem' }} />
              <span className="ui-skeleton-line" style={{ width: '55%' }} />
              <span className="ui-skeleton-line" style={{ width: '35%' }} />
            </div>
          ))}
        </div>
      ) : null}

      {!isMissingCourseId && !isLoading && !error && data ? (
        <>
          <div className="ui-stat-grid course-dashboard-kpis">
            <MetricCard label="Total students" value={data.total_students} icon={<IconUsers />} />
            <MetricCard label="Present count" value={data.present_count} icon={<IconCheckCircle />} />
            <MetricCard label="Absent count" value={data.absent_count} icon={<IconXCircle />} />
            <MetricCard label="Attendance rate" value={`${data.attendance_percentage}%`} icon={<IconPercent />} />
          </div>

          <section className="ui-surface ui-section course-dashboard-chart-card">
            <PageHeader
              eyebrow="Trend"
              title="Attendance trend"
              description={
                range === 'weekly'
                  ? 'Present and absent counts per week, with the attendance rate overlaid.'
                  : 'Present and absent counts per month, with the attendance rate overlaid.'
              }
              actions={(
                <div className="course-dashboard-toggle" role="group" aria-label="Chart period">
                  <button
                    type="button"
                    className={`course-dashboard-toggle__option${range === 'weekly' ? ' course-dashboard-toggle__option--active' : ''}`}
                    aria-pressed={range === 'weekly'}
                    onClick={() => setRange('weekly')}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    className={`course-dashboard-toggle__option${range === 'monthly' ? ' course-dashboard-toggle__option--active' : ''}`}
                    aria-pressed={range === 'monthly'}
                    onClick={() => setRange('monthly')}
                  >
                    Monthly
                  </button>
                </div>
              )}
            />

            <div className="course-dashboard-chart-frame">
              {!hasTrend ? (
                <section className="ui-empty course-dashboard-chart-empty">
                  <h3>
                    {summaries.length === 0
                      ? `No ${range} data yet`
                      : `Not enough ${range === 'weekly' ? 'weekly' : 'monthly'} data for a trend`}
                  </h3>
                  <p>
                    {summaries.length === 0
                      ? 'Start attendance sessions to populate this attendance trend chart.'
                      : 'At least two periods are needed to compare present, absent, and attendance rate over time.'}
                  </p>
                  {singlePeriod ? (
                    <p className="course-dashboard-chart-empty__period">
                      {formatSummaryPeriod(singlePeriod.period_start)} · {singlePeriod.present_count} present ·{' '}
                      {singlePeriod.absent_count} absent · {singlePeriod.attendance_percentage.toFixed(1)}%
                    </p>
                  ) : null}
                </section>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={summaries} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis
                      dataKey="period_start"
                      tickFormatter={formatSummaryPeriod}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={16}
                      tick={{ fill: chartColors.tick, fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="count"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tick={{ fill: chartColors.tick, fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="percentage"
                      orientation="right"
                      domain={[0, 100]}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value) => `${Math.round(Number(value))}%`}
                      tick={{ fill: chartColors.tick, fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: chartColors.cursor }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) {
                          return null
                        }

                        const point = payload[0]?.payload as AttendanceSummary | undefined

                        if (!point) {
                          return null
                        }

                        return (
                          <div className="course-dashboard-tooltip">
                            <p className="course-dashboard-tooltip__title">
                              {formatSummaryPeriod(String(label))}
                            </p>
                            <p className="course-dashboard-tooltip__row">
                              <span className="course-dashboard-tooltip__dot" style={{ background: chartColors.present }} />
                              <span>Present</span>
                              <strong>{point.present_count}</strong>
                            </p>
                            <p className="course-dashboard-tooltip__row">
                              <span className="course-dashboard-tooltip__dot" style={{ background: chartColors.absent }} />
                              <span>Absent</span>
                              <strong>{point.absent_count}</strong>
                            </p>
                            <p className="course-dashboard-tooltip__row">
                              <span className="course-dashboard-tooltip__dot" style={{ background: chartColors.percentage }} />
                              <span>Attendance</span>
                              <strong>{point.attendance_percentage.toFixed(1)}%</strong>
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar
                      yAxisId="count"
                      dataKey="present_count"
                      name="Present"
                      stackId="attendance"
                      fill={chartColors.present}
                      maxBarSize={56}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="absent_count"
                      name="Absent"
                      stackId="attendance"
                      fill={chartColors.absent}
                      maxBarSize={56}
                      radius={[6, 6, 0, 0]}
                    />
                    <Line
                      yAxisId="percentage"
                      type="monotone"
                      dataKey="attendance_percentage"
                      name="Attendance %"
                      stroke={chartColors.percentage}
                      strokeWidth={3}
                      dot={{ r: 3.5, fill: chartColors.percentage, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}

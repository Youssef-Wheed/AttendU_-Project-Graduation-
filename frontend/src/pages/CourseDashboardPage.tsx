import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import MetricCard from '../components/ui/MetricCard'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { getCourseDashboard, type CourseDashboardResponse } from '../features/courses/api/courseApi'
import { useTopbarSetter } from '../context/TopbarContext'
import { useTheme } from '../context/ThemeContext'
import './CourseDashboardPage.css'

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
  }

  useEffect(() => {
    setTopbar({
      kicker: 'Analytics',
      title: 'Course analytics',
      description: id
        ? `Attendance trend reporting for course ${id.slice(0, 8)}.`
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
  }, [setTopbar, id, navigate])

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

  return (
    <section className="ui-surface ui-section course-dashboard-overview">
      <PageHeader
        eyebrow="Performance"
        title="Attendance snapshot"
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
          <div className="ui-stat-grid">
            <MetricCard label="Total students" value={data.total_students} icon={<IconUsers />} />
            <MetricCard label="Present count" value={data.present_count} icon={<IconCheckCircle />} />
            <MetricCard label="Absent count" value={data.absent_count} icon={<IconXCircle />} />
            <MetricCard label="Attendance rate" value={`${data.attendance_percentage}%`} icon={<IconPercent />} />
          </div>

          <div className="course-dashboard-chart-grid">
            <section className="ui-surface ui-section">
              <PageHeader
                eyebrow="Trend"
                title="Weekly summaries"
                description="Compare weekly present and absent counts across recent attendance windows."
              />
              <div className="course-dashboard-chart-frame">
                {data.weekly_summaries.length === 0 ? (
                  <section className="ui-empty course-dashboard-chart-empty">
                    <h3>No weekly data yet</h3>
                    <p>Start attendance sessions to populate this weekly trend chart.</p>
                  </section>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={data.weekly_summaries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                      <XAxis
                        dataKey="period_start"
                        tickFormatter={formatSummaryPeriod}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartColors.tick, fontSize: 12 }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(label) => formatSummaryPeriod(String(label))}
                        labelStyle={{ color: chartColors.text }}
                        itemStyle={{ color: chartColors.text }}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          borderRadius: '16px',
                          border: '1px solid var(--color-border-strong)',
                          boxShadow: 'var(--shadow-2)',
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Line type="monotone" dataKey="present_count" stroke={chartColors.present} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Present" />
                      <Line type="monotone" dataKey="absent_count" stroke={chartColors.absent} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Absent" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="ui-surface ui-section">
              <PageHeader
                eyebrow="Trend"
                title="Monthly summaries"
                description="Use the monthly rollup to spot broader attendance changes over time."
              />
              <div className="course-dashboard-chart-frame">
                {data.monthly_summaries.length === 0 ? (
                  <section className="ui-empty course-dashboard-chart-empty">
                    <h3>No monthly data yet</h3>
                    <p>Start attendance sessions to populate this monthly trend chart.</p>
                  </section>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={data.monthly_summaries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                      <XAxis
                        dataKey="period_start"
                        tickFormatter={formatSummaryPeriod}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartColors.tick, fontSize: 12 }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(label) => formatSummaryPeriod(String(label))}
                        labelStyle={{ color: chartColors.text }}
                        itemStyle={{ color: chartColors.text }}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          borderRadius: '16px',
                          border: '1px solid var(--color-border-strong)',
                          boxShadow: 'var(--shadow-2)',
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Line type="monotone" dataKey="present_count" stroke={chartColors.present} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Present" />
                      <Line type="monotone" dataKey="absent_count" stroke={chartColors.absent} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Absent" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'

import Button from '../components/ui/Button'
import { ManualCheckIn } from '../features/attendance/components/ManualCheckIn'
import { AttendanceList } from '../features/attendance/components/AttendanceList'
import SessionControls from '../features/attendance/components/SessionControls'
import { stopSession } from '../features/attendance/api/attendanceSessionApi'
import type { AttendanceSessionResponse } from '../features/attendance/types/attendanceSessionTypes'
import { listDevicesAdmin } from '../features/admin/api/devicesAdminApi'
import type { DeviceApiResponse } from '../features/admin/types/adminApiTypes'
import { getCourses } from '../features/courses/api/courseApi'
import type { CourseResponse } from '../features/courses/types/courseTypes'
import { getSections } from '../features/sections/api/sectionApi'
import type { SectionResponse } from '../features/sections/types/sectionTypes'
import { useAttendanceSocket } from '../hooks/useAttendanceSocket'
import { useTopbarSetter } from '../context/TopbarContext'
import './SessionPage.css'

const IconTimer = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2h4" /><path d="M12 14v-4" /><path d="M12 2v2" /><circle cx="12" cy="14" r="8" /></svg>
)

const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
)

const IconWifi = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8.82a15 15 0 0 1 20 0" /><path d="M5 12.87a10 10 0 0 1 14 0" /><path d="M8.5 16.9a5 5 0 0 1 7 0" /><line x1="12" y1="21" x2="12.01" y2="21" /></svg>
)

const IconSection = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
)

const IconDevice = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
)

const RING_RADIUS = 54
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const formatElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':')
}

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const formatVerification = (method: AttendanceSessionResponse['verification_method']): string => {
  if (method === 'RFID_FACE') return 'RFID + Face'
  if (method === 'RFID') return 'RFID only'
  return 'Manual'
}

const DAY_DISPLAY: Record<string, string> = {
  MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday',
}

const formatSchedule = (value: string): string => {
  const parts = value.trim().split(' ')
  if (parts.length === 2 && DAY_DISPLAY[parts[0]]) {
    return `${DAY_DISPLAY[parts[0]]} · ${parts[1]}`
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }
  return value
}

export default function SessionPage() {
  const [sections, setSections] = useState<SectionResponse[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken] = useState(0)
  const [courses, setCourses] = useState<CourseResponse[]>([])
  const [activeSession, setActiveSession] = useState<AttendanceSessionResponse | null>(null)
  const [devices, setDevices] = useState<DeviceApiResponse[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [isDeviceLoading, setIsDeviceLoading] = useState(true)
  const [checkinSearch, setCheckinSearch] = useState('')
  const [checkInMode, setCheckInMode] = useState<'rfid' | 'rfid_face' | 'manual'>('manual')
  const [sessionNow, setSessionNow] = useState(() => Date.now())
  const [isStopping, setIsStopping] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const setTopbar = useTopbarSetter()

  const { presentStudents, totalStudents, isConnected, connectionError, addLocalCheckin } = useAttendanceSocket(
    activeSession?.id ?? null,
  )

  useEffect(() => {
    setTopbar({
      title: (
        <div className="session-topbar-title">
          Live Session
          <span className={`session-topbar-pill ${activeSession ? 'is-active' : 'is-idle'}`}>
            {activeSession ? 'ACTIVE' : 'IDLE'}
          </span>
        </div>
      ),
    })
  }, [setTopbar, activeSession])

  useEffect(() => {
    let isActive = true
    const loadSections = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await getSections()
        if (!isActive) return
        setSections(result)
        setSelectedSectionId((current) => {
          if (current && result.some((section) => section.id === current)) return current
          return result[0]?.id ?? ''
        })
      } catch (requestError) {
        if (!isActive) return
        setError(requestError instanceof Error ? requestError.message : 'Failed to load sections.')
        setSections([])
        setSelectedSectionId('')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }
    void loadSections()
    return () => { isActive = false }
  }, [reloadToken])

  useEffect(() => {
    let isActive = true
    const loadCourses = async () => {
      try {
        const result = await getCourses()
        if (isActive) setCourses(result)
      } catch {
        if (isActive) setCourses([])
      }
    }
    void loadCourses()
    return () => { isActive = false }
  }, [reloadToken])

  useEffect(() => {
    if (!activeSession) return
    const timerId = window.setInterval(() => setSessionNow(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [activeSession])

  useEffect(() => {
    let isActive = true
    const loadDevices = async () => {
      setIsDeviceLoading(true)
      try {
        const result = await listDevicesAdmin()
        if (!isActive) return
        setDevices(result)
        setSelectedDeviceId((current) => {
          if (current && result.some((device) => device.id === current)) return current
          return result[0]?.id ?? ''
        })
      } catch {
        if (!isActive) return
        setDevices([])
        setSelectedDeviceId('')
      } finally {
        if (isActive) setIsDeviceLoading(false)
      }
    }
    void loadDevices()
    return () => { isActive = false }
  }, [reloadToken])

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  )

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  )

  const selectedCourse = useMemo(
    () => (selectedSection ? courses.find((course) => course.id === selectedSection.course_id) ?? null : null),
    [courses, selectedSection],
  )

  const courseLabel = selectedCourse
    ? `${selectedCourse.course_name} · ${selectedCourse.course_code}`
    : 'Course unavailable'

  const deviceStatus = useMemo(() => {
    if (!selectedDevice) return { tone: 'off', label: 'No device selected' }
    if (selectedSection && selectedDevice.section_id === selectedSection.id) {
      return { tone: 'ready', label: 'Assigned to this section' }
    }
    if (selectedDevice.section_id) {
      return { tone: 'warn', label: 'Assigned to another section' }
    }
    return { tone: 'idle', label: 'Unassigned device' }
  }, [selectedDevice, selectedSection])

  const elapsedTime = useMemo(() => {
    if (!activeSession) return '--:--:--'
    const startTime = new Date(activeSession.start_time)
    if (Number.isNaN(startTime.getTime())) return '--:--:--'
    return formatElapsed(sessionNow - startTime.getTime())
  }, [activeSession, sessionNow])

  const countdown = useMemo(() => {
    if (!activeSession) return '--:--:--'
    const endTime = new Date(activeSession.end_time).getTime()
    if (Number.isNaN(endTime)) return '--:--:--'
    return formatElapsed(endTime - sessionNow)
  }, [activeSession, sessionNow])

  const timeProgress = useMemo(() => {
    if (!activeSession) return 0
    const startTime = new Date(activeSession.start_time).getTime()
    const endTime = new Date(activeSession.end_time).getTime()
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return 0
    const remaining = endTime - sessionNow
    return Math.max(0, Math.min(1, remaining / (endTime - startTime)))
  }, [activeSession, sessionNow])

  const sessionDurationLabel = useMemo(() => {
    if (!activeSession) return ''
    const startTime = new Date(activeSession.start_time).getTime()
    const endTime = new Date(activeSession.end_time).getTime()
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return ''
    return formatDuration(Math.max(1, Math.round((endTime - startTime) / 60_000)))
  }, [activeSession])

  const presentCount = presentStudents.length
  const absentCount = Math.max(totalStudents - presentCount, 0)
  const attendancePercent = totalStudents > 0
    ? Math.round((presentCount / totalStudents) * 100)
    : 0

  const handleStopSession = async () => {
    if (!activeSession) return
    setIsStopping(true)
    setStopError(null)
    try {
      await stopSession(activeSession.id)
      setActiveSession(null)
    } catch (requestError) {
      setStopError(requestError instanceof Error ? requestError.message : 'Failed to stop session.')
    } finally {
      setIsStopping(false)
    }
  }

  const handleSessionChange = useCallback((session: AttendanceSessionResponse | null) => {
    setActiveSession(session)
    setSessionNow(Date.now())
    setStopError(null)
  }, [])

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId)
    setActiveSession(null)
    setStopError(null)
  }

  return (
    <div className="session-page">

      {/* ─── LEFT: SETUP ─── */}
      <aside className="session-setup">
        <section className="session-setup-card">

          {/* Section */}
          <div className="setup-field">
            <label className="setup-label" htmlFor="session-section">
              <span className="setup-label__icon"><IconSection /></span>
              Section
            </label>
            {isLoading ? (
              <p className="setup-hint">Loading sections…</p>
            ) : error ? (
              <p className="setup-hint setup-hint--error">{error}</p>
            ) : (
              <select
                id="session-section"
                className="ui-select setup-select"
                value={selectedSectionId}
                onChange={(e) => handleSectionChange(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.section_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Course + schedule summary */}
          {selectedSection && (
            <div className="setup-meta">
              <div className="setup-meta__row setup-meta__row--course">
                <span className="setup-meta__key">Course</span>
                <span className="setup-meta__value setup-meta__value--strong">{courseLabel}</span>
              </div>
              <div className="setup-meta__row">
                <span className="setup-meta__key">Schedule</span>
                <span className="setup-meta__value">{formatSchedule(selectedSection.schedule_time)}</span>
              </div>
              <div className="setup-meta__row">
                <span className="setup-meta__key">Section</span>
                <span className="setup-meta__value">{selectedSection.section_name}</span>
              </div>
            </div>
          )}

          {/* Device */}
          <div className="setup-field">
            <label className="setup-label" htmlFor="session-device">
              <span className="setup-label__icon"><IconDevice /></span>
              Device
            </label>
            <select
              id="session-device"
              className="ui-select setup-select"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={isDeviceLoading}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.device_name}</option>
              ))}
            </select>
            <div className={`setup-device-status is-${deviceStatus.tone}`}>
              <span className="setup-device-status__dot" aria-hidden="true" />
              <span>{deviceStatus.label}</span>
            </div>
            {selectedDevice?.location && (
              <p className="setup-hint">Location: {selectedDevice.location}</p>
            )}
          </div>

          {/* Session form / live note */}
          {selectedSection ? (
            <SessionControls
              sectionId={selectedSection.id}
              activeSession={activeSession}
              onSessionChange={handleSessionChange}
            />
          ) : (
            <div className="session-setup-empty">Select a section to configure a session.</div>
          )}
        </section>
      </aside>

      {/* ─── RIGHT: LIVE PANEL ─── */}
      <section className="session-live">
        {activeSession ? (
          <div className="session-live-panel">

            {/* Hero: ring + counters + progress */}
            <div className="live-hero">
              <div className="live-ring" aria-label={`Time remaining: ${countdown}`}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle
                    cx="60" cy="60" r={RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    className="live-ring__track"
                    strokeWidth="9"
                  />
                  <circle
                    cx="60" cy="60" r={RING_RADIUS}
                    fill="none"
                    className="live-ring__progress"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - timeProgress)}
                  />
                </svg>
                <div className="live-ring__inner">
                  <span className="live-ring__label">Time remaining</span>
                  <span className="live-ring__time">{countdown}</span>
                  <span className="live-ring__hint">{sessionDurationLabel} session</span>
                </div>
              </div>

              <div className="live-stats">
                <div className="live-stats__grid">
                  <article className="live-stat live-stat--present">
                    <span className="live-stat__label">Present</span>
                    <span className="live-stat__value">{presentCount}</span>
                  </article>
                  <article className="live-stat">
                    <span className="live-stat__label">Total</span>
                    <span className="live-stat__value">{totalStudents}</span>
                  </article>
                  <article className="live-stat live-stat--absent">
                    <span className="live-stat__label">Absent</span>
                    <span className="live-stat__value">{absentCount}</span>
                  </article>
                </div>

                <div className="live-progress">
                  <div className="live-progress__head">
                    <span>Attendance progress</span>
                    <strong>{attendancePercent}%</strong>
                  </div>
                  <div
                    className="live-progress__track"
                    role="progressbar"
                    aria-valuenow={attendancePercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Attendance progress"
                  >
                    <div className="live-progress__fill" style={{ width: `${attendancePercent}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Status bar */}
            <div className="session-status-bar">
              <div className="session-status-item">
                <span className="session-status-item__icon"><IconTimer /></span>
                <div>
                  <p className="session-status-item__label">Elapsed</p>
                  <p className="session-status-item__value">{elapsedTime}</p>
                </div>
              </div>

              <div className="session-status-divider" aria-hidden="true" />

              <div className="session-status-item">
                <span className="session-status-item__icon"><IconWifi /></span>
                <div>
                  <p className="session-status-item__label">Live feed</p>
                  <p className={`session-status-item__value ${isConnected ? 'is-live' : 'is-offline'}`}>
                    {isConnected ? 'Connected' : 'Offline'}
                  </p>
                  {!isConnected && connectionError ? (
                    <p className="session-status-item__meta">{connectionError}</p>
                  ) : null}
                </div>
                <span className={`session-socket-dot ${isConnected ? '' : 'is-offline'}`} />
              </div>

              <div className="session-status-divider" aria-hidden="true" />

              <div className="session-status-item">
                <div>
                  <p className="session-status-item__label">Verification</p>
                  <p className="session-status-item__value">{formatVerification(activeSession.verification_method)}</p>
                </div>
              </div>

              <div className="session-mode-wrap">
                <p className="session-status-item__label">Check-in mode</p>
                <div className="session-mode-group">
                  {(['rfid', 'rfid_face', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`session-mode-btn ${checkInMode === mode ? 'is-active' : ''}`}
                      onClick={() => setCheckInMode(mode)}
                    >
                      {mode === 'rfid' ? 'RFID' : mode === 'rfid_face' ? 'Hybrid' : 'Manual'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="session-search-bar">
              <span className="session-search-bar__icon" aria-hidden="true"><IconSearch /></span>
              <input
                type="search"
                className="ui-input session-search-bar__input"
                placeholder="Search the live attendance feed…"
                value={checkinSearch}
                onChange={(e) => setCheckinSearch(e.target.value)}
              />
            </div>

            {/* Manual check-in */}
            {selectedDeviceId ? (
              <ManualCheckIn
                sessionId={activeSession.id}
                sectionId={selectedSection?.id ?? ''}
                deviceId={selectedDeviceId}
                onCheckInAccepted={addLocalCheckin}
              />
            ) : (
              <div className="ui-alert ui-alert--error">Select a device to enable manual entries.</div>
            )}

            {/* Live list */}
            <AttendanceList
              presentStudents={presentStudents}
              totalStudents={totalStudents}
              isConnected={isConnected}
              query={checkinSearch}
            />

            {/* Stop */}
            {stopError && (
              <div className="ui-alert ui-alert--error" role="alert">
                <p className="ui-alert__content">{stopError}</p>
              </div>
            )}
            <div className="live-stop">
              <Button
                variant="danger"
                size="lg"
                fullWidth
                loading={isStopping}
                onClick={handleStopSession}
              >
                {isStopping ? 'Stopping…' : 'Stop Session'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="session-idle-state">
            <div className="session-idle-state__graphic">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <p className="session-idle-state__kicker">Live panel</p>
            <h3 className="session-idle-state__title">No active session yet</h3>
            <p className="session-idle-state__body">
              Set up the session on the left, then start it. The countdown, live counters,
              and check-in feed will appear here.
            </p>
            <ul className="session-idle-checklist">
              <li><span className="session-idle-checklist__index">1</span>Choose a section and confirm the course.</li>
              <li><span className="session-idle-checklist__index">2</span>Pick the device that will receive check-ins.</li>
              <li><span className="session-idle-checklist__index">3</span>Name the session, set a duration, and choose verification.</li>
              <li><span className="session-idle-checklist__index">4</span>Press Start Session to open the live window.</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

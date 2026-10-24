import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { createSession, getActiveSessions, preloadSessionFaces } from '../api/attendanceSessionApi'
import type {
  AttendanceSessionCreate,
  AttendanceSessionResponse,
  SessionVerificationMethod,
} from '../types/attendanceSessionTypes'
import { authStore } from '../../../store/authStore'
import './SessionControls.css'

export interface SessionControlsProps {
  sectionId: string
  activeSession: AttendanceSessionResponse | null
  onSessionChange?: (session: AttendanceSessionResponse | null) => void
  title?: string
  description?: string
}

const DURATION_PRESETS = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 h',    value: 60 },
  { label: '1 h 30', value: 90 },
  { label: '2 h',    value: 120 },
]

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const formatClock = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
}

export function SessionControls({
  sectionId,
  activeSession,
  onSessionChange,
  title = 'Session details',
  description = 'Name the session, choose a duration, and pick how students verify.',
}: SessionControlsProps) {
  const currentUser = authStore.getUser()

  const [sessionTitle, setSessionTitle]       = useState('')
  const [durationMin, setDurationMin]         = useState(60)
  const [customDuration, setCustomDuration]   = useState('')
  const [isCustom, setIsCustom]               = useState(false)
  const [verificationMethod, setVerificationMethod] = useState<SessionVerificationMethod>('RFID')

  const [isLoading, setIsLoading]             = useState(true)
  const [isSubmitting, setIsSubmitting]       = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  /* ── Load active session on mount / section change ── */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const sessions = await getActiveSessions()
        const match = sessions.find((s) => s.section_id === sectionId) ?? null
        if (!cancelled) {
          onSessionChange?.(match)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load session.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [onSessionChange, sectionId])

  /* Effective duration (minutes) */
  const effectiveDuration = useMemo(() => {
    if (!isCustom) return durationMin
    const v = parseInt(customDuration, 10)
    return Number.isFinite(v) && v > 0 ? v : 0
  }, [isCustom, durationMin, customDuration])

  /* ── Handlers ── */
  const selectPreset = (value: number) => {
    setIsCustom(false)
    setDurationMin(value)
  }

  const handleCreateSession = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!currentUser) { setError('You must be logged in to start a session.'); return }
    if (!sessionTitle.trim()) { setError('Session title is required.'); return }
    if (effectiveDuration <= 0) { setError('Please set a valid duration.'); return }

    const startTime = new Date()
    const endTime   = new Date(startTime.getTime() + effectiveDuration * 60_000)

    const payload: AttendanceSessionCreate = {
      section_id:    sectionId,
      created_by_id: String(currentUser.id),
      title:         sessionTitle.trim(),
      start_time:    startTime.toISOString(),
      end_time:      endTime.toISOString(),
      verification_method: verificationMethod,
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const created = await createSession(payload)

      // If RFID_FACE, preload face encodings
      if (verificationMethod === 'RFID_FACE') {
        try {
          await preloadSessionFaces(created.id)
        } catch (preloadErr) {
          console.warn('Failed to preload faces:', preloadErr)
          // Non-fatal, we continue
        }
      }

      setSessionTitle('')
      onSessionChange?.(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="session-controls" aria-live="polite">

      {/* Header */}
      <div className="session-controls-header">
        <div>
          <h3>{title}</h3>
          <p className="session-controls-description">{description}</p>
        </div>
        <span className={`session-controls-status ${activeSession ? 'active' : 'idle'}`}>
          {activeSession && <span className="session-controls-status-dot" aria-hidden="true" />}
          {activeSession ? 'Live' : 'Ready'}
        </span>
      </div>

      {/* Error / loading feedback */}
      {error    && <p className="session-controls-feedback error">{error}</p>}
      {isLoading && <p className="session-controls-feedback info">Checking session status…</p>}

      {/* ── Live note (details live in the right panel) ── */}
      {!isLoading && activeSession && (
        <div className="sc-live-note">
          <span className="sc-live-note__dot" aria-hidden="true" />
          <div>
            <p className="sc-live-note__title">{activeSession.title}</p>
            <p className="sc-live-note__meta">
              Session is live · ends at {formatClock(activeSession.end_time)}
            </p>
          </div>
        </div>
      )}

      {/* ── Create form ── */}
      {!isLoading && !activeSession && (
        <form className="session-controls-form" onSubmit={handleCreateSession}>

          {/* Title */}
          <div className="sc-field">
            <label htmlFor={`sc-title-${sectionId}`}>Session title</label>
            <input
              id={`sc-title-${sectionId}`}
              type="text"
              className="sc-input"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="e.g. Week 9 — Lecture"
              maxLength={120}
              required
            />
          </div>

          {/* Duration */}
          <div className="sc-field">
            <label>Duration</label>

            {/* Preset chips */}
            <div className="sc-duration-chips" role="group" aria-label="Duration presets">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`sc-chip ${!isCustom && durationMin === p.value ? 'is-active' : ''}`}
                  onClick={() => selectPreset(p.value)}
                  aria-pressed={!isCustom && durationMin === p.value}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`sc-chip ${isCustom ? 'is-active' : ''}`}
                onClick={() => setIsCustom(true)}
                aria-pressed={isCustom}
              >
                Custom
              </button>
            </div>

            {/* Custom input */}
            {isCustom && (
              <div className="sc-custom-wrap">
                <input
                  className="sc-input sc-custom-input"
                  type="number"
                  min="1"
                  max="480"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="Enter minutes"
                  autoFocus
                />
                <span className="sc-custom-unit">min</span>
              </div>
            )}

            {/* Preview */}
            {effectiveDuration > 0 && (
              <p className="sc-duration-preview">
                Session will run for <strong>{formatDuration(effectiveDuration)}</strong>
              </p>
            )}
          </div>

          {/* Verification Method */}
          <div className="sc-field">
            <label htmlFor={`sc-method-${sectionId}`}>Verification method</label>
            <select
              id={`sc-method-${sectionId}`}
              className="sc-input sc-select"
              value={verificationMethod}
              onChange={(e) => setVerificationMethod(e.target.value as SessionVerificationMethod)}
            >
              <option value="RFID">RFID Only</option>
              <option value="RFID_FACE">RFID + Face Verification</option>
              <option value="MANUAL">Manual Attendance Only</option>
            </select>
            {verificationMethod === 'RFID_FACE' && (
              <p className="sc-duration-preview sc-duration-preview--accent">
                Face encodings will be pre-loaded when the session starts.
              </p>
            )}
          </div>

          <button
            className="session-controls-button primary"
            type="submit"
            disabled={isSubmitting || effectiveDuration <= 0}
          >
            {isSubmitting ? 'Starting…' : 'Start Session'}
          </button>
        </form>
      )}
    </section>
  )
}

export default SessionControls

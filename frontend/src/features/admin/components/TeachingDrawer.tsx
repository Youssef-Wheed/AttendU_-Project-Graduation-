import { useCallback, useEffect, useState } from 'react'

import FeedbackBanner from '../../../components/ui/FeedbackBanner'
import {
  getUserTeachingAdmin,
} from '../api/usersAdminApi'
import { updateSectionAdmin } from '../api/sectionsAdminApi'
import type {
  TeachingSectionApiResponse,
  UserAdminListResponse,
  UserTeachingApiResponse,
} from '../types/adminApiTypes'
import type { UserAdminRow } from '../types/adminContracts'
import './TeachingDrawer.css'

interface TeachingDrawerProps {
  user: UserAdminRow | null
  users: UserAdminListResponse[]
  onClose: () => void
  onReassigned: () => Promise<void>
}

const formatLastSession = (value: string | null): string =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'No sessions yet'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to load teaching details.'

const CloseIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export default function TeachingDrawer({
  user,
  users,
  onClose,
  onReassigned,
}: TeachingDrawerProps) {
  const [teaching, setTeaching] = useState<UserTeachingApiResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadErrorUserId, setLoadErrorUserId] = useState<string | null>(null)
  const [reassigningSectionId, setReassigningSectionId] = useState<string | null>(null)
  const [selectedInstructorId, setSelectedInstructorId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const userId = user?.id ?? null

  const loadTeaching = useCallback(async (targetUserId: string): Promise<string | null> => {
    try {
      const response = await getUserTeachingAdmin(targetUserId)
      setTeaching(response)
      setLoadError(null)
      setLoadErrorUserId(null)
      return null
    } catch (error) {
      const message = getErrorMessage(error)
      setLoadError(message)
      setLoadErrorUserId(targetUserId)
      return message
    }
  }, [])

  const isLoading = Boolean(
    userId && teaching?.id !== userId && loadErrorUserId !== userId,
  )

  useEffect(() => {
    if (!userId) {
      return
    }

    let isCurrent = true
    void getUserTeachingAdmin(userId)
      .then((response) => {
        if (!isCurrent) {
          return
        }
        setTeaching(response)
        setLoadError(null)
        setLoadErrorUserId(null)
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return
        }
        setLoadError(getErrorMessage(error))
        setLoadErrorUserId(userId)
      })

    return () => {
      isCurrent = false
    }
  }, [userId])

  useEffect(() => {
    if (!user) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSaving, onClose, user])

  const eligibleUsers = users.filter(
    (candidate) => candidate.role === 'admin' || candidate.role === 'instructor',
  )

  const handleReassign = async (section: TeachingSectionApiResponse) => {
    if (!user || !selectedInstructorId) {
      setActionError('Choose an administrator or instructor to reassign this section.')
      return
    }

    setIsSaving(true)
    setActionError(null)
    setActionMessage(null)

    try {
      await updateSectionAdmin(section.section_id, {
        course_id: section.course_id,
        instructor_id: selectedInstructorId,
        section_name: section.section_name,
        schedule_time: section.schedule_time,
      })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to reassign instructor.')
      setIsSaving(false)
      return
    }

    setReassigningSectionId(null)
    setSelectedInstructorId('')
    setActionMessage('Instructor reassigned successfully.')

    try {
      const refreshError = await loadTeaching(user.id)
      if (refreshError) {
        setActionError(
          `The instructor was reassigned, but the view could not be refreshed: ${refreshError}`,
        )
      }
      await onReassigned()
    } catch (error) {
      setActionError(
        error instanceof Error
          ? `The instructor was reassigned, but the view could not be refreshed: ${error.message}`
          : 'The instructor was reassigned, but the view could not be refreshed.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <>
      <button
        type="button"
        className="teaching-drawer__backdrop"
        aria-label="Close teaching details"
        onClick={onClose}
      />
      <aside
        className="teaching-drawer"
        aria-labelledby="teaching-drawer-title"
        aria-modal="true"
        role="dialog"
      >
        <header className="teaching-drawer__header">
          <div>
            <p className="teaching-drawer__eyebrow">Teaching</p>
            <h2 id="teaching-drawer-title">{user.fullName}</h2>
            <p className="teaching-drawer__email">{user.email}</p>
          </div>
          <button
            type="button"
            className="teaching-drawer__close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close teaching details"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="teaching-drawer__body">
          {loadError && loadErrorUserId === user.id && (
            <FeedbackBanner
              variant="error"
              title="Teaching details unavailable"
              description={loadError}
              actionLabel="Retry"
              onAction={() => {
                setLoadErrorUserId(null)
                void loadTeaching(user.id)
              }}
            />
          )}

          {actionError && (
            <FeedbackBanner variant="error" description={actionError} />
          )}

          {actionMessage && (
            <div className="teaching-drawer__success" role="status">
              {actionMessage}
            </div>
          )}

          {isLoading && (
            <div className="teaching-drawer__loading" role="status" aria-live="polite">
              <span className="admin-skeleton-line" />
              <span className="admin-skeleton-line" />
              <span className="admin-skeleton-line" />
              <span>Loading teaching details...</span>
            </div>
          )}

          {!isLoading && teaching && (
            <>
              <section className="teaching-drawer__summary" aria-label="Teaching summary">
                <div>
                  <span>Sections</span>
                  <strong>{teaching.sections_count}</strong>
                </div>
                <div>
                  <span>Unique students</span>
                  <strong>{teaching.unique_students}</strong>
                </div>
                <div>
                  <span>Total enrollments</span>
                  <strong>{teaching.total_enrollments}</strong>
                </div>
                <div>
                  <span>Sessions</span>
                  <strong>{teaching.sessions_count}</strong>
                </div>
              </section>

              {teaching.sections.length === 0 ? (
                <FeedbackBanner
                  variant="empty"
                  title="No sections assigned"
                  description={`${user.fullName} does not currently own any sections.`}
                />
              ) : (
                <section className="teaching-drawer__sections" aria-label="Assigned sections">
                  {teaching.sections.map((section) => (
                    <article className="teaching-drawer__section" key={section.section_id}>
                      <div className="teaching-drawer__section-heading">
                        <div>
                          <p>{section.course_code}</p>
                          <h3>{section.course_name}</h3>
                          <span>Section {section.section_name}</span>
                        </div>
                        <button
                          type="button"
                          className="ui-button ui-button--secondary ui-button--sm"
                          onClick={() => {
                            setReassigningSectionId((current) =>
                              current === section.section_id ? null : section.section_id,
                            )
                            setSelectedInstructorId('')
                            setActionError(null)
                            setActionMessage(null)
                          }}
                        >
                          Reassign instructor
                        </button>
                      </div>

                      <dl className="teaching-drawer__details">
                        <div>
                          <dt>Schedule</dt>
                          <dd>{section.schedule_time}</dd>
                        </div>
                        <div>
                          <dt>Students</dt>
                          <dd>{section.students_count}</dd>
                        </div>
                        <div>
                          <dt>Sessions</dt>
                          <dd>{section.sessions_count}</dd>
                        </div>
                        <div>
                          <dt>Last session</dt>
                          <dd>{formatLastSession(section.last_session_at)}</dd>
                        </div>
                      </dl>

                      {reassigningSectionId === section.section_id && (
                        <div className="teaching-drawer__reassign">
                          <label htmlFor={`instructor-${section.section_id}`}>
                            New section owner
                          </label>
                          <select
                            id={`instructor-${section.section_id}`}
                            className="ui-select"
                            value={selectedInstructorId}
                            onChange={(event) => setSelectedInstructorId(event.target.value)}
                          >
                            <option value="">Choose an administrator or instructor</option>
                            {eligibleUsers.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.full_name} ({candidate.role})
                              </option>
                            ))}
                          </select>
                          <div className="teaching-drawer__reassign-actions">
                            <button
                              type="button"
                              className="ui-button ui-button--secondary ui-button--sm"
                              onClick={() => setReassigningSectionId(null)}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="ui-button ui-button--primary ui-button--sm"
                              onClick={() => void handleReassign(section)}
                              disabled={
                                isSaving ||
                                !selectedInstructorId ||
                                selectedInstructorId === user.id
                              }
                            >
                              {isSaving ? 'Saving...' : 'Save instructor'}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}

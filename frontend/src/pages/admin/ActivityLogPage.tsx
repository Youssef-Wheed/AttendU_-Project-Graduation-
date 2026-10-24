import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'

import { listAuditLogsAdmin } from '../../features/admin/api/auditLogsAdminApi'
import type {
  AuditLogEntry,
  AuditLogFilters,
} from '../../features/admin/types/adminApiTypes'
import { exportToCSV } from '../../utils/exportToCSV'
import './AdminPages.css'
import './ActivityLogPage.css'

const PAGE_SIZE = 25
const EXPORT_LIMIT = 5000

const actionOptions = [
  ['student.created', 'Student created'],
  ['student.updated', 'Student updated'],
  ['student.face_registered', 'Student face registered'],
  ['student.deleted', 'Student deleted'],
  ['user.created', 'User created'],
  ['user.deleted', 'User deleted'],
  ['course.created', 'Course created'],
  ['course.updated', 'Course updated'],
  ['course.deleted', 'Course deleted'],
  ['section.created', 'Section created'],
  ['section.updated', 'Section updated'],
  ['section.deleted', 'Section deleted'],
  ['enrollment.added', 'Enrollment added'],
  ['enrollment.removed', 'Enrollment removed'],
  ['attendance_session.started', 'Session started'],
  ['attendance_session.stopped', 'Session stopped'],
  ['attendance_session.updated', 'Session updated'],
  ['attendance_session.deleted', 'Session deleted'],
  ['Session started', 'Session started (legacy)'],
  ['Check-in accepted', 'Check-in accepted'],
  ['Check-in rejected', 'Check-in rejected'],
  ['Fraud attempt', 'Fraud attempt'],
  ['Session closed', 'Session closed (legacy)'],
]

const entityOptions = [
  'student',
  'user',
  'course',
  'section',
  'enrollment',
  'attendance_session',
  'attendance_event',
]

const toActionLabel = (action: string): string => {
  const match = actionOptions.find(([value]) => value === action)
  if (match) return match[1]
  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const toCsvRow = (entry: AuditLogEntry): Record<string, unknown> => ({
  Time: new Date(entry.created_at).toISOString(),
  Actor: entry.actor_name,
  Action: toActionLabel(entry.action),
  Entity: [entry.entity_type, entry.entity_label ?? entry.entity_id]
    .filter(Boolean)
    .join(': '),
  Message: entry.message,
  'Event type': entry.event_type,
  Source: entry.action_source,
  Metadata: entry.metadata_json ? JSON.stringify(entry.metadata_json) : '',
})

export default function ActivityLogPage() {
  const [draftFilters, setDraftFilters] = useState<AuditLogFilters>({})
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [page, setPage] = useState(1)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const loadEntries = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listAuditLogsAdmin(filters, page, PAGE_SIZE)
      setEntries(result.items)
      setTotal(result.total)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load activity log.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFilters = Object.fromEntries(
      Object.entries(draftFilters)
        .map(([key, value]) => [key, value?.trim()])
        .filter(([, value]) => Boolean(value)),
    ) as AuditLogFilters
    setFilters(nextFilters)
    setPage(1)
    setExportNotice(null)
  }

  const clearFilters = () => {
    setDraftFilters({})
    setFilters({})
    setPage(1)
    setExportNotice(null)
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportCurrentFilters = async () => {
    setIsExporting(true)
    setExportNotice(null)
    try {
      const firstPage = await listAuditLogsAdmin(filters, 1, 100)
      const exportCount = Math.min(firstPage.total, EXPORT_LIMIT)
      if (exportCount === 0) {
        setExportNotice('There are no activity entries to export for these filters.')
        return
      }

      const exportEntries = firstPage.items.slice(0, exportCount)
      let exportPage = 2
      while (exportEntries.length < exportCount) {
        const result = await listAuditLogsAdmin(filters, exportPage, 100)
        if (result.items.length === 0) break
        exportEntries.push(...result.items.slice(0, exportCount - exportEntries.length))
        exportPage += 1
      }

      exportToCSV(
        exportEntries.map(toCsvRow),
        'activity-log',
        { includeBom: true },
      )
      setExportNotice(
        firstPage.total > EXPORT_LIMIT
          ? `Export truncated to the newest ${EXPORT_LIMIT.toLocaleString()} of ${firstPage.total.toLocaleString()} matching entries.`
          : `Exported ${exportEntries.length.toLocaleString()} matching entries.`,
      )
    } catch (exportError) {
      setExportNotice(
        exportError instanceof Error
          ? `Export failed: ${exportError.message}`
          : 'Export failed. Please try again.',
      )
    } finally {
      setIsExporting(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="admin-page-stack activity-log">
      <form className="activity-log__filters" onSubmit={applyFilters}>
        <label>
          <span>Action</span>
          <select
            value={draftFilters.action ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, action: event.target.value }))
            }
          >
            <option value="">All actions</option>
            {actionOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Entity</span>
          <select
            value={draftFilters.entity_type ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, entity_type: event.target.value }))
            }
          >
            <option value="">All entities</option>
            {entityOptions.map((entity) => (
              <option key={entity} value={entity}>{entity.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Actor</span>
          <input
            value={draftFilters.actor ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, actor: event.target.value }))
            }
            placeholder="Name or user ID"
          />
        </label>
        <label>
          <span>From</span>
          <input
            type="date"
            value={draftFilters.date_from ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, date_from: event.target.value }))
            }
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={draftFilters.date_to ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, date_to: event.target.value }))
            }
          />
        </label>
        <label className="activity-log__search">
          <span>Message contains</span>
          <input
            value={draftFilters.search ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Search audit messages"
          />
        </label>
        <div className="activity-log__filter-actions">
          <button className="activity-log__button activity-log__button--primary" type="submit">
            Apply filters
          </button>
          <button className="activity-log__button" type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </form>

      <div className="activity-log__toolbar">
        <p aria-live="polite">
          {total.toLocaleString()} {total === 1 ? 'activity' : 'activities'}
        </p>
        <button
          className="activity-log__button activity-log__button--primary"
          type="button"
          onClick={() => void exportCurrentFilters()}
          disabled={isExporting || isLoading}
        >
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {exportNotice && (
        <p className="activity-log__notice" role="status">{exportNotice}</p>
      )}
      {error && (
        <div className="activity-log__error" role="alert">
          <span>{error}</span>
          <button className="activity-log__button" type="button" onClick={() => void loadEntries()}>
            Retry
          </button>
        </div>
      )}

      <div className="activity-log__table-wrap">
        <table className="activity-log__table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="activity-log__state" colSpan={5}>Loading activity…</td></tr>
            ) : error ? null : entries.length === 0 ? (
              <tr><td className="activity-log__state" colSpan={5}>No activity matches these filters.</td></tr>
            ) : entries.map((entry) => {
              const isExpanded = expandedIds.has(entry.id)
              const detailsId = `activity-details-${entry.id}`
              return (
                <Fragment key={entry.id}>
                  <tr>
                    <td><time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time></td>
                    <td>{entry.actor_name}</td>
                    <td><span className="activity-log__action">{toActionLabel(entry.action)}</span></td>
                    <td>
                      <span className="activity-log__entity-type">{entry.entity_type ?? '—'}</span>
                      <span className="activity-log__entity-label">
                        {entry.entity_label ?? entry.entity_id ?? '—'}
                      </span>
                    </td>
                    <td>
                      <div className="activity-log__detail-cell">
                        <span>{entry.message}</span>
                        <button
                          className="activity-log__expand"
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={detailsId}
                          onClick={() => toggleExpanded(entry.id)}
                        >
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr id={detailsId}>
                      <td colSpan={5}>
                        <dl className="activity-log__metadata">
                          <div><dt>Event type</dt><dd>{entry.event_type}</dd></div>
                          <div><dt>Source</dt><dd>{entry.action_source}</dd></div>
                          <div className="activity-log__metadata-json">
                            <dt>Metadata</dt>
                            <dd>
                              <pre>{JSON.stringify(entry.metadata_json ?? {}, null, 2)}</pre>
                            </dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <nav className="activity-log__pagination" aria-label="Activity log pages">
        <button
          className="activity-log__button"
          type="button"
          disabled={isLoading || page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        <span>Page {page} of {pageCount}</span>
        <button
          className="activity-log__button"
          type="button"
          disabled={isLoading || page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
        >
          Next
        </button>
      </nav>
    </section>
  )
}

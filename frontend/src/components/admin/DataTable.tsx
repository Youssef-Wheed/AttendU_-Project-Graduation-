import type { ReactNode } from 'react'
import { IconEdit, IconTrash } from '../ui/Icons'
import './DataTable.css'

export interface DataTableColumn<TRow> {
  id: string
  header: string
  cell: (row: TRow) => ReactNode
  align?: 'left' | 'center' | 'right'
}

interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[]
  rows: TRow[]
  getRowId: (row: TRow) => string
  isLoading?: boolean
  loadingRowCount?: number
  onEditRow?: (row: TRow) => void
  onDeleteRow?: (row: TRow) => void
  canDeleteRow?: (row: TRow) => boolean
  onRowClick?: (row: TRow) => void
  emptyState?: ReactNode
}

export default function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  isLoading = false,
  loadingRowCount = 4,
  onEditRow,
  onDeleteRow,
  canDeleteRow,
  onRowClick,
  emptyState,
}: DataTableProps<TRow>) {
  const hasActions = Boolean(onEditRow || onDeleteRow)
  const visibleColumns = columns.length + (hasActions ? 1 : 0)

  return (
    <div className="admin-table-wrap ui-table-mobile-cards">
      <table className="admin-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className={`admin-table-align-${column.align ?? 'left'}`}>
                {column.header}
              </th>
            ))}
            {hasActions && <th className="admin-table-align-right" style={{ width: '120px' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: loadingRowCount }).map((_, index) => (
              <tr key={`loading-${index}`}>
                {columns.map((column) => (
                  <td key={`${column.id}-${index}`} data-label={column.header}>
                    <span className="admin-skeleton-line" aria-hidden="true" />
                  </td>
                ))}
                {hasActions && (
                  <td className="admin-table-align-right" data-label="Actions">
                    <span className="admin-skeleton-line admin-skeleton-line-short" aria-hidden="true" />
                  </td>
                )}
              </tr>
            ))}

          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={visibleColumns}>
                <div className="admin-table-empty">{emptyState}</div>
              </td>
            </tr>
          )}

          {!isLoading &&
            rows.map((row) => (
              <tr 
                key={getRowId(row)} 
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'admin-table-row--clickable' : ''}
              >
                {columns.map((column) => (
                  <td 
                    key={`${column.id}-${getRowId(row)}`} 
                    className={`admin-table-align-${column.align ?? 'left'}`}
                    data-label={column.header}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {hasActions && (
                  <td 
                    className="admin-table-actions admin-table-align-right" 
                    onClick={(e) => e.stopPropagation()}
                    data-label="Actions"
                  >
                    {onEditRow && (
                      <button 
                        type="button" 
                        className="ui-button ui-button--sm ui-button--icon-only" 
                        style={{ background: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
                        onClick={() => onEditRow(row)}
                        aria-label={`Edit ${getRowId(row)}`}
                        title="Edit"
                      >
                        <IconEdit />
                      </button>
                    )}
                    {onDeleteRow && (
                      <button 
                        type="button" 
                        className="ui-button ui-button--sm ui-button--icon-only" 
                        style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: 'none' }}
                        onClick={() => onDeleteRow(row)}
                        disabled={canDeleteRow ? !canDeleteRow(row) : false}
                        aria-label={`Delete ${getRowId(row)}`}
                        title={canDeleteRow && !canDeleteRow(row) ? 'You cannot delete your own account.' : 'Delete'}
                      >
                        <IconTrash />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

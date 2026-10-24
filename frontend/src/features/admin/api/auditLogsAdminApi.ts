import { httpClient } from '../../../api/httpClient'
import type {
  AuditLogFilters,
  AuditLogPageResponse,
} from '../types/adminApiTypes'
import { extractApiErrorMessage } from './adminApiUtils'

export const listAuditLogsAdmin = async (
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<AuditLogPageResponse> => {
  try {
    const response = await httpClient.get<AuditLogPageResponse>('/audit-logs', {
      params: { ...filters, page, page_size: pageSize },
    })
    return response.data
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to load activity log.'))
  }
}

import { isAxiosError } from 'axios'

import { httpClient } from '../../../api/httpClient'
import type { StudentReportResponse } from '../types/studentReportTypes'

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError<{ detail?: string }>(error)) {
    if (typeof error.response?.data?.detail === 'string') {
      return error.response.data.detail
    }
  }

  return 'Failed to load the student attendance report.'
}

export const getStudentReport = async (
  studentId: string,
): Promise<StudentReportResponse> => {
  try {
    const response = await httpClient.get<StudentReportResponse>(
      `/students/${studentId}/report`,
    )
    return response.data
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

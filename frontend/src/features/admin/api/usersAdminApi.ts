import { httpClient } from '../../../api/httpClient'
import type {
  UserAdminListResponse,
  UserApiCreatePayload,
  UserApiResponse,
  UserTeachingApiResponse,
} from '../types/adminApiTypes'
import { extractApiErrorMessage } from './adminApiUtils'

export const listUsersAdmin = async (): Promise<UserAdminListResponse[]> => {
  try {
    const response = await httpClient.get<UserAdminListResponse[]>('/users')
    return response.data
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to fetch users.'))
  }
}

export const getUserTeachingAdmin = async (
  userId: string,
): Promise<UserTeachingApiResponse> => {
  try {
    const response = await httpClient.get<UserTeachingApiResponse>(
      `/users/${userId}/teaching`,
    )
    return response.data
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to fetch teaching details.'))
  }
}

export const createUserAdmin = async (
  payload: UserApiCreatePayload,
): Promise<UserApiResponse> => {
  try {
    const response = await httpClient.post<UserApiResponse>('/users', payload)
    return response.data
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to create user.'))
  }
}

export const deleteUserAdmin = async (userId: string): Promise<void> => {
  try {
    await httpClient.delete(`/users/${userId}`)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to delete user.'))
  }
}

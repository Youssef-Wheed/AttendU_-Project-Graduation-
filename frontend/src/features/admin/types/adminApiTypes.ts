export interface TimestampedEntity {
  id: string
  created_at: string
  updated_at: string
}

export interface StudentApiResponse extends TimestampedEntity {
  full_name: string
  email: string
  phone: string | null
  rfid_uid: string
  face_reference_image: string | null
  section_ids: string[]
  attendance_rate?: number
}

export interface StudentApiUpsertPayload {
  full_name: string
  email: string
  phone?: string | null
  rfid_uid: string
  face_reference_image?: string | null
  section_ids?: string[]
}

export interface CourseApiResponse extends TimestampedEntity {
  course_name: string
  course_code: string
}

export interface CourseApiUpsertPayload {
  course_name: string
  course_code: string
}

export interface SectionApiResponse extends TimestampedEntity {
  course_id: string
  instructor_id: string
  section_name: string
  schedule_time: string
}

export interface SectionApiUpsertPayload {
  course_id: string
  instructor_id: string
  section_name: string
  schedule_time: string
}

export interface DeviceApiResponse extends TimestampedEntity {
  device_name: string
  location: string | null
  section_id: string | null
}

export interface DeviceApiUpsertPayload {
  device_name: string
  location?: string | null
  section_id?: string | null
}

export interface UserApiResponse extends TimestampedEntity {
  full_name: string
  email: string
  role: string
}

export interface UserAdminListResponse extends UserApiResponse {
  sections_count: number
}

export interface TeachingSectionApiResponse {
  section_id: string
  section_name: string
  schedule_time: string
  course_id: string
  course_code: string
  course_name: string
  students_count: number
  sessions_count: number
  last_session_at: string | null
}

export interface UserTeachingApiResponse {
  id: string
  full_name: string
  email: string
  role: string
  sections: TeachingSectionApiResponse[]
  sections_count: number
  unique_students: number
  total_enrollments: number
  sessions_count: number
}

export interface UserApiCreatePayload {
  full_name: string
  email: string
  password?: string
  role: string
}

export interface AuditLogEntry {
  id: string
  created_at: string
  updated_at: string
  actor_user_id: string | null
  actor_name: string
  event_type: string
  action_source: string
  message: string
  metadata_json: Record<string, unknown> | null
  action: string
  entity_type: string | null
  entity_id: string | null
  entity_label: string | null
}

export interface AuditLogPageResponse {
  items: AuditLogEntry[]
  total: number
  page: number
  page_size: number
}

export interface AuditLogFilters {
  action?: string
  entity_type?: string
  actor?: string
  date_from?: string
  date_to?: string
  search?: string
}

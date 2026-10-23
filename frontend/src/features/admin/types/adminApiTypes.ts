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

export interface UserApiCreatePayload {
  full_name: string
  email: string
  password?: string
  role: string
}

export interface CourseResponse {
  id: string
  created_at: string
  updated_at: string
  course_name: string
  course_code: string
}

export interface CourseStudentAttendanceResponse {
  id: string
  created_at: string
  updated_at: string
  full_name: string
  email: string
  phone: string | null
  rfid_uid: string
  face_reference_image: string | null
  attendance_percentage: number
  present_count: number
  total_sessions: number
}

export interface AttendanceSummary {
  period_start: string
  total_sessions: number
  present_count: number
  absent_count: number
  attendance_percentage: number
}

export interface CourseDashboardResponse {
  total_students: number
  present_count: number
  absent_count: number
  attendance_percentage: number
  weekly_summaries: AttendanceSummary[]
  monthly_summaries: AttendanceSummary[]
}

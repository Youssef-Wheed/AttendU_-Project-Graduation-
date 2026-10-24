export type StudentReportSessionStatus = 'Present' | 'Absent'

export type StudentReportStanding =
  | 'Good standing'
  | 'Needs attention'
  | 'Critical risk'

export interface StudentReportSession {
  session_id: string
  title: string
  date: string
  status: StudentReportSessionStatus
}

export interface StudentReportCourse {
  course_id: string
  course_code: string
  course_name: string
  section_id: string
  section_name: string
  instructor_name: string
  attended: number
  absent: number
  total_sessions: number
  percentage: number
  status: StudentReportStanding
  sessions: StudentReportSession[]
}

export interface StudentReportTotals {
  courses: number
  attended: number
  absent: number
  total_sessions: number
  percentage: number
}

export interface StudentReportResponse {
  student: {
    id: string
    full_name: string
    email: string
    rfid_uid: string
  }
  courses: StudentReportCourse[]
  totals: StudentReportTotals
  generated_at: string
}

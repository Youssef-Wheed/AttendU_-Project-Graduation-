export type PresenceMethod = 'RFID' | 'FACE' | 'MANUAL'

export interface UserAdminRow {
  id: string
  fullName: string
  email: string
  role: string
  sectionsCount: number
  createdAt: string
}

export interface StudentAdminRow {
  id: string
  fullName: string
  email: string
  rfidUid: string
  sectionCount: number
  attendanceRate: number
}

export interface StudentFormPayload {
  fullName: string
  email: string
  phone: string
  rfidUid: string
  sectionIds: string[]
}

export interface CourseAdminRow {
  id: string
  courseName: string
  courseCode: string
  sectionCount: number
  instructorCount: number
}

export interface CourseFormPayload {
  courseName: string
  courseCode: string
  description: string
}

export interface SectionAdminRow {
  id: string
  sectionName: string
  courseCode: string
  instructorName: string
  scheduleTime: string
  enrolledCount: number
}

export interface SectionFormPayload {
  sectionName: string
  courseId: string
  instructorId: string
  dayOfWeek: string
  timeOfDay: string
}

export interface DeviceAdminRow {
  id: string
  deviceName: string
  location: string
  sectionName: string
  supportedMethods: PresenceMethod[]
  isActive: boolean
}

export interface DeviceFormPayload {
  deviceName: string
  location: string
  sectionId: string
  supportedMethods: PresenceMethod[]
  isActive: boolean
}

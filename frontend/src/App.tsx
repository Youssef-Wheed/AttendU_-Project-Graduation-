import { Routes, Route, Navigate } from 'react-router-dom'

import AppLayout from './layouts/AppLayout'
import AdminShell from './components/admin/AdminShell'
import LoginPage from './components/LoginPage'
import RegisterPage from './components/RegisterPage'
import { useAuthActions } from './features/auth/hooks/useAuthActions'
import CoursesAdminPage from './pages/admin/CoursesAdminPage'
import DevicesAdminPage from './pages/admin/DevicesAdminPage'
import EnrollmentsAdminPage from './pages/admin/EnrollmentsAdminPage'
import SectionsAdminPage from './pages/admin/SectionsAdminPage'
import StudentsAdminPage from './pages/admin/StudentsAdminPage'
import UsersAdminPage from './pages/admin/UsersAdminPage'
import CourseDashboardPage from './pages/CourseDashboardPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import StudentsPage from './pages/StudentsPage'
import AllStudentsPage from './pages/AllStudentsPage'
import StudentReportPage from './pages/StudentReportPage'
import ProtectedRoute from './routes/ProtectedRoute'

function App() {
  const { isLoading, error, login, register, clearError } = useAuthActions()

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          <LoginPage
            onLogin={login}
            isLoading={isLoading}
            error={error}
            onClearError={clearError}
          />
        }
      />
      <Route
        path="/register"
        element={
          <RegisterPage
            onRegister={register}
            isLoading={isLoading}
            error={error}
            onClearError={clearError}
          />
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students/:id/report" element={<StudentReportPage />} />
          <Route path="/students" element={<AllStudentsPage />} />
          <Route path="/courses/:id/students" element={<StudentsPage />} />
          <Route path="/courses/:id" element={<CourseDashboardPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route element={<ProtectedRoute allowedRoles={['admin']} unauthorizedPath="/dashboard" />}>
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<Navigate to="students" replace />} />
              <Route path="users" element={<UsersAdminPage />} />
              <Route path="students" element={<StudentsAdminPage />} />
              <Route path="courses" element={<CoursesAdminPage />} />
              <Route path="sections" element={<SectionsAdminPage />} />
              <Route path="devices" element={<DevicesAdminPage />} />
              <Route path="enrollments" element={<EnrollmentsAdminPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App

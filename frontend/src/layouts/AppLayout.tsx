import { useMemo } from 'react'
import { Outlet } from 'react-router-dom'

import WorkspaceShell, { type WorkspaceNavItem } from '../components/ui/WorkspaceShell'
import RouteTransition from '../components/ui/RouteTransition'
import { TopbarProvider, useTopbarConfig } from '../context/TopbarContext'
import { useAuthActions } from '../features/auth/hooks/useAuthActions'
import { authStore } from '../store/authStore'
import {
  IconDashboard,
  IconTimer,
  IconHistory,
  IconSettings,
  IconAdmin,
  IconUsers,
  IconStudents,
  IconCourse,
  IconSections,
  IconDevices,
  IconEnrollments,
} from '../components/ui/Icons'

function AppLayoutInner() {
  const { logout } = useAuthActions()
  const user = authStore.getUser()
  const config = useTopbarConfig()

  const roleLabel = useMemo(() => {
    if (!user?.role) return 'User'
    return user.role.charAt(0).toUpperCase() + user.role.slice(1)
  }, [user?.role])

  const navigation = useMemo<WorkspaceNavItem[]>(() => {
    const items: WorkspaceNavItem[] = [
      {
        path: '/dashboard',
        label: 'Dashboard',
        shortLabel: 'Home',
        icon: <IconDashboard />,
        isActive: (pathname) => pathname === '/dashboard' || pathname.startsWith('/courses/'),
      },
      {
        path: '/session',
        label: 'Session',
        shortLabel: 'Session',
        icon: <IconTimer />,
        isActive: (pathname) => pathname.startsWith('/session'),
      },
      {
        path: '/history',
        label: 'History',
        shortLabel: 'History',
        icon: <IconHistory />,
        isActive: (pathname) => pathname.startsWith('/history'),
      },
      {
        path: '/students',
        label: 'Students',
        shortLabel: 'Students',
        icon: <IconStudents />,
        isActive: (pathname) => pathname === '/students',
      },
      {
        path: '/settings',
        label: 'Settings',
        shortLabel: 'Settings',
        icon: <IconSettings />,
        isActive: (pathname) => pathname.startsWith('/settings'),
        pinBottom: true,
      },
    ]

    if (user?.role === 'admin') {
      items.push({
        path: '/admin',
        label: 'Admin',
        shortLabel: 'Admin',
        icon: <IconAdmin />,
        isActive: (pathname) => pathname.startsWith('/admin'),
        children: [
          { path: '/admin/users',       label: 'Users',       icon: <IconUsers size={16} /> },
          { path: '/admin/students',    label: 'Students',    icon: <IconStudents size={16} /> },
          { path: '/admin/courses',     label: 'Courses',     icon: <IconCourse size={16} /> },
          { path: '/admin/sections',    label: 'Sections',    icon: <IconSections size={16} /> },
          { path: '/admin/devices',     label: 'Devices',     icon: <IconDevices size={16} /> },
          { path: '/admin/enrollments', label: 'Enrollments', icon: <IconEnrollments size={16} /> },
          { path: '/admin/activity-log', label: 'Activity Log', icon: <IconHistory size={16} /> },
        ],
      })
    }

    return items
  }, [user?.role])

  return (
    <WorkspaceShell
      brandingKicker="Instructor workspace"
      navigation={navigation}
      userName={user?.full_name ?? 'User'}
      userRole={roleLabel}
      topbarKicker={config.kicker}
      topbarTitle={config.title ?? ''}
      topbarDescription={config.description}
      topbarActions={config.actions}
      onLogout={logout}
    >
      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </WorkspaceShell>
  )
}

export default function AppLayout() {
  return (
    <TopbarProvider>
      <AppLayoutInner />
    </TopbarProvider>
  )
}

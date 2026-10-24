import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Button from '../ui/Button'
import { useTopbarSetter } from '../../context/TopbarContext'

export interface AdminTopBarConfig {
  title: string
  description?: string
  primaryActionLabel?: string
  onPrimaryAction?: () => void
  isPrimaryActionDisabled?: boolean
  isPrimaryActionLoading?: boolean
}

export interface AdminShellOutletContext {
  setTopBarConfig: (config: AdminTopBarConfig) => void
  resetTopBarConfig: () => void
}

const routeTitles: Record<string, string> = {
  '/admin/users': 'Administrative Users',
  '/admin/students': 'Students',
  '/admin/courses': 'Courses',
  '/admin/sections': 'Sections',
  '/admin/devices': 'Devices',
  '/admin/enrollments': 'Enrollments',
  '/admin/activity-log': 'Activity Log',
}

const routeDescriptions: Record<string, string> = {
  '/admin/users': 'Manage system administrators and instructors with access to the control panel.',
  '/admin/students': 'Manage student profiles, identifiers, and section assignments from one consistent admin surface.',
  '/admin/courses': 'Keep course records clean and aligned with the rest of the product experience.',
  '/admin/sections': 'Connect sections to courses, schedules, and instructors with the same shared forms and tables.',
  '/admin/devices': 'Review attendance devices, locations, methods, and status within the unified control panel.',
  '/admin/enrollments': 'Add and remove students from sections without leaving the standardized admin workflow.',
  '/admin/activity-log': 'Review important account, academic, enrollment, and attendance actions.',
}

const getDefaultTopBarConfig = (pathname: string): AdminTopBarConfig => ({
  title: routeTitles[pathname] ?? 'Admin workspace',
  description: routeDescriptions[pathname] ?? 'Manage operational records and system configuration from the shared workspace shell.',
})

export default function AdminShell() {
  const location = useLocation()
  const setTopbar = useTopbarSetter()

  const defaultTopBarConfig = useMemo(
    () => getDefaultTopBarConfig(location.pathname),
    [location.pathname],
  )

  const [topBarOverride, setTopBarOverride] = useState<{
    pathname: string
    config: AdminTopBarConfig
  } | null>(null)

  const setTopBarConfig = useCallback((config: AdminTopBarConfig) => {
    setTopBarOverride({ pathname: location.pathname, config })
  }, [location.pathname])

  const resetTopBarConfig = useCallback(() => {
    setTopBarOverride(null)
  }, [])

  const topBarConfig =
    topBarOverride && topBarOverride.pathname === location.pathname
      ? topBarOverride.config
      : defaultTopBarConfig

  const topbarActions = useMemo(() => {
    if (!topBarConfig.primaryActionLabel) return null
    return (
      <Button
        onClick={topBarConfig.onPrimaryAction}
        disabled={
          topBarConfig.isPrimaryActionDisabled ||
          topBarConfig.isPrimaryActionLoading ||
          !topBarConfig.onPrimaryAction
        }
        loading={topBarConfig.isPrimaryActionLoading}
      >
        {topBarConfig.primaryActionLabel}
      </Button>
    )
  }, [
    topBarConfig.primaryActionLabel,
    topBarConfig.onPrimaryAction,
    topBarConfig.isPrimaryActionDisabled,
    topBarConfig.isPrimaryActionLoading,
  ])

  useEffect(() => {
    setTopbar({
      kicker: 'Administration',
      title: topBarConfig.title,
      description: topBarConfig.description,
      actions: topbarActions,
    })
  }, [setTopbar, topBarConfig.title, topBarConfig.description, topbarActions])

  const outletContext = useMemo<AdminShellOutletContext>(
    () => ({ setTopBarConfig, resetTopBarConfig }),
    [resetTopBarConfig, setTopBarConfig],
  )

  return <Outlet context={outletContext} />
}

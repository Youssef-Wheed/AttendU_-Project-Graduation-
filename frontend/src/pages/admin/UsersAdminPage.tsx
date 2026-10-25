import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'

import type { AdminShellOutletContext, AdminTopBarConfig } from '../../components/admin/AdminShell'
import AdminFormModal from '../../components/admin/AdminFormModal'
import ConfirmDeleteModal from '../../components/admin/ConfirmDeleteModal'
import DataTable, { type DataTableColumn } from '../../components/admin/DataTable'
import TableToolbar from '../../components/admin/TableToolbar'
import FeedbackBanner from '../../components/ui/FeedbackBanner'
import TeachingDrawer from '../../features/admin/components/TeachingDrawer'
import {
  createUserAdmin,
  deleteUserAdmin,
  listUsersAdmin,
} from '../../features/admin/api/usersAdminApi'
import type {
  UserAdminListResponse,
  UserApiCreatePayload,
} from '../../features/admin/types/adminApiTypes'
import type { UserAdminRow } from '../../features/admin/types/adminContracts'
import { useSnackbar } from '../../hooks/useSnackbar'
import { authStore } from '../../store/authStore'
import './AdminPages.css'

const initialUserForm: UserApiCreatePayload = {
  full_name: '',
  email: '',
  password: '',
  role: 'instructor',
}

export default function UsersAdminPage() {
  const [rows, setRows] = useState<UserAdminRow[]>([])
  const [users, setUsers] = useState<UserAdminListResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formState, setFormState] = useState<UserApiCreatePayload>(initialUserForm)
  const [selectedUser, setSelectedUser] = useState<UserAdminRow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedTeachingUser, setSelectedTeachingUser] = useState<UserAdminRow | null>(null)

  const { setTopBarConfig, resetTopBarConfig } = useOutletContext<AdminShellOutletContext>()
  const { showSnackbar } = useSnackbar()
  const currentUserId = String(authStore.getUser()?.id ?? '')

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setFeedbackError(null)

    try {
      const loadedUsers = await listUsersAdmin()
      setUsers(loadedUsers)
      setRows(loadedUsers.map(user => ({
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        sectionsCount: user.sections_count,
        createdAt: new Date(user.created_at).toLocaleDateString(),
      })))
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Failed to load users.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const openCreateModal = useCallback(() => {
    setFormState(initialUserForm)
    setIsFormOpen(true)
    setFormError(null)
  }, [])

  useEffect(() => {
    const config: AdminTopBarConfig = {
      title: 'Administrative Users',
      description: 'Manage system administrators and instructors.',
      primaryActionLabel: 'Add User',
      onPrimaryAction: openCreateModal,
    }
    setTopBarConfig(config)
    return () => resetTopBarConfig()
  }, [setTopBarConfig, resetTopBarConfig, openCreateModal])

  const columns = useMemo<DataTableColumn<UserAdminRow>[]>(
    () => [
      { id: 'fullName', header: 'Name', cell: (row) => row.fullName },
      { id: 'email', header: 'Email', cell: (row) => row.email },
      {
        id: 'sectionsCount',
        header: 'Sections',
        align: 'center',
        cell: (row) => (
          <button
            type="button"
            className="admin-user-sections-count"
            onClick={(event) => {
              event.stopPropagation()
              setSelectedTeachingUser(row)
            }}
            aria-label={`View teaching for ${row.fullName}`}
          >
            {row.sectionsCount}
          </button>
        ),
      },
      { 
        id: 'role', 
        header: 'Role', 
        cell: (row) => (
          <span className={`admin-status-pill ${row.role === 'admin' ? 'admin-status-pill-active' : 'admin-status-pill-inactive'}`} style={{ background: row.role === 'admin' ? 'var(--color-primary-soft)' : 'var(--color-secondary-soft)', color: row.role === 'admin' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
            {row.role}
          </span>
        ) 
      },
      { id: 'createdAt', header: 'Created', cell: (row) => row.createdAt },
    ],
    [],
  )

  const handleDelete = useCallback((row: UserAdminRow) => {
    if (row.id === currentUserId) return
    setSelectedUser(row)
    setIsDeleteOpen(true)
  }, [currentUserId])

  const canDeleteUser = useCallback(
    (row: UserAdminRow) => row.id !== currentUserId,
    [currentUserId],
  )

  const handleFormSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      await createUserAdmin(formState)
      await loadUsers()
      setIsFormOpen(false)
      showSnackbar('User created successfully.', 'success')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }, [formState, loadUsers, showSnackbar])

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedUser) return
    setIsDeleting(true)

    try {
      await deleteUserAdmin(selectedUser.id)
      await loadUsers()
      setIsDeleteOpen(false)
      showSnackbar('User deleted successfully.', 'success')
    } catch (error) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to delete user.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedUser, loadUsers, showSnackbar])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const query = searchQuery.toLowerCase()
    return rows.filter(row => 
      row.fullName.toLowerCase().includes(query) || 
      row.email.toLowerCase().includes(query)
    )
  }, [rows, searchQuery])

  return (
    <div className="admin-page-stack">
      <TableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search users by name or email..."
      />

      {feedbackError && (
        <FeedbackBanner 
          variant="error" 
          description={feedbackError} 
          actionLabel="Retry" 
          onAction={loadUsers} 
        />
      )}

      <DataTable
        columns={columns}
        rows={filteredRows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        onDeleteRow={handleDelete}
        canDeleteRow={canDeleteUser}
        emptyState={
          <FeedbackBanner
            variant="empty"
            title="No users found"
            description="Manage system access for instructors and admins."
          />
        }
      />

      <TeachingDrawer
        user={selectedTeachingUser}
        users={users}
        onClose={() => setSelectedTeachingUser(null)}
        onReassigned={loadUsers}
      />

      <AdminFormModal
        isOpen={isFormOpen}
        title="Create New User"
        description="Add a new administrator or instructor to the system."
        submitLabel="Create User"
        isSubmitting={isSubmitting}
        errorMessage={formError}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      >
        <div className="admin-form-grid">
          <div className="ui-field">
            <label className="ui-field__label">Full Name</label>
            <input
              className="ui-input"
              value={formState.full_name}
              onChange={(e) => setFormState(curr => ({ ...curr, full_name: e.target.value }))}
              placeholder="e.g. John Doe"
              required
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label">Email Address</label>
            <input
              className="ui-input"
              type="email"
              value={formState.email}
              onChange={(e) => setFormState(curr => ({ ...curr, email: e.target.value }))}
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label">Temporary Password</label>
            <input
              className="ui-input"
              type="password"
              value={formState.password}
              onChange={(e) => setFormState(curr => ({ ...curr, password: e.target.value }))}
              placeholder="Minimum 6 characters"
              required
              minLength={6}
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label">Role</label>
            <select
              className="ui-select"
              value={formState.role}
              onChange={(e) => setFormState(curr => ({ ...curr, role: e.target.value }))}
            >
              <option value="instructor">Instructor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>
      </AdminFormModal>

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        title="Delete User"
        message={`Are you sure you want to delete ${selectedUser?.fullName}? This action cannot be undone.`}
        confirmLabel="Delete User"
        isConfirming={isDeleting}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

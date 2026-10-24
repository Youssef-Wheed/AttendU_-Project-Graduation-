import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import type { AdminTopBarConfig } from '../../components/admin/AdminShell'
import AdminFormModal from '../../components/admin/AdminFormModal'
import ConfirmDeleteModal from '../../components/admin/ConfirmDeleteModal'
import DataTable, { type DataTableColumn } from '../../components/admin/DataTable'
import EmptyState from '../../components/admin/EmptyState'
import StudentDetailModal from '../../components/admin/StudentDetailModal'
import {
  createStudentAdmin,
  deleteStudentAdmin,
  getStudent,
  listStudentsAdmin,
  registerStudentFaceAdmin,
  updateStudentAdmin,
} from '../../features/admin/api/studentsAdminApi'
import {
  enrollStudentToSectionAdmin,
  listSectionsAdmin,
  listSectionStudentsAdmin,
  removeStudentFromSectionAdmin,
} from '../../features/admin/api/sectionsAdminApi'
import type {
  SectionApiResponse,
  StudentApiResponse,
  StudentApiUpsertPayload,
} from '../../features/admin/types/adminApiTypes'
import type { StudentAdminRow, StudentFormPayload } from '../../features/admin/types/adminContracts'
import { useAdminPageConfig } from './useAdminPageConfig'
import './AdminPages.css'

const initialStudentForm: StudentFormPayload = {
  fullName: '',
  email: '',
  phone: '',
  rfidUid: '',
  sectionIds: [],
}

const toStudentRow = (student: StudentApiResponse): StudentAdminRow => ({
  id: student.id,
  fullName: student.full_name,
  email: student.email,
  rfidUid: student.rfid_uid,
  sectionCount: student.section_ids?.length ?? 0,
  attendanceRate: student.attendance_rate ?? 0,
})

const toStudentPayload = (formState: StudentFormPayload): StudentApiUpsertPayload => ({
  full_name: formState.fullName.trim(),
  email: formState.email.trim(),
  phone: formState.phone.trim() || undefined,
  rfid_uid: formState.rfidUid.trim(),
})

export default function StudentsAdminPage() {
  const [rows, setRows] = useState<StudentAdminRow[]>([])
  const [studentsById, setStudentsById] = useState<Record<string, StudentApiResponse>>({})
  const [sections, setSections] = useState<SectionApiResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formState, setFormState] = useState<StudentFormPayload>(initialStudentForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<StudentAdminRow | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [detailStudent, setDetailStudent] = useState<StudentApiResponse | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedFaceFile, setSelectedFaceFile] = useState<File | null>(null)
  const [facePreviewUrl, setFacePreviewUrl] = useState<string | null>(null)
  const faceUploadInputRef = useRef<HTMLInputElement>(null)
  const detailFaceUploadInputRef = useRef<HTMLInputElement>(null)

  const syncStudentIntoState = useCallback((student: StudentApiResponse) => {
    const nextRow = toStudentRow(student)
    setRows((currentRows) => {
      const existingIndex = currentRows.findIndex((row) => row.id === nextRow.id)
      if (existingIndex === -1) return [nextRow, ...currentRows]
      const updatedRows = [...currentRows]
      updatedRows[existingIndex] = nextRow
      return updatedRows
    })
    setStudentsById((current) => ({ ...current, [student.id]: student }))
  }, [])

  const removeStudentFromState = useCallback((studentId: string) => {
    setRows((currentRows) => currentRows.filter((row) => row.id !== studentId))
    setStudentsById((current) => {
      const next = { ...current }
      delete next[studentId]
      return next
    })
  }, [])

  useEffect(() => {
    if (!selectedFaceFile) {
      setFacePreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(selectedFaceFile)
    setFacePreviewUrl(previewUrl)

    return () => URL.revokeObjectURL(previewUrl)
  }, [selectedFaceFile])

  const loadStudents = useCallback(async () => {
    setIsLoading(true)
    setFeedbackError(null)
    try {
      const [students, sectionList] = await Promise.all([
        listStudentsAdmin(),
        listSectionsAdmin(),
      ])
      setRows(students.map(toStudentRow))
      setStudentsById(Object.fromEntries(students.map((s) => [s.id, s])))
      setSections(sectionList)
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Failed to load students.')
      setRows([])
      setStudentsById({})
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadStudents() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [loadStudents])

  const openCreateModal = useCallback(() => {
    setEditingId(null)
    setFormState(initialStudentForm)
    setFormError(null)
    setSelectedFaceFile(null)
    setIsFormOpen(true)
  }, [])

  const pageConfig = useMemo<AdminTopBarConfig>(
    () => ({
      title: 'Students',
      description: 'Manage student profiles, RFID identifiers, and section membership.',
      primaryActionLabel: 'Add Student',
      onPrimaryAction: openCreateModal,
      isPrimaryActionLoading: isSubmitting,
    }),
    [isSubmitting, openCreateModal],
  )

  useAdminPageConfig(pageConfig)

  const columns = useMemo<DataTableColumn<StudentAdminRow>[]>(
    () => [
      {
        id: 'fullName',
        header: 'Student',
        cell: (row) => (
          <Link
            to={`/students/${row.id}/report`}
            onClick={(event) => event.stopPropagation()}
          >
            {row.fullName}
          </Link>
        ),
      },
      { id: 'email', header: 'Email', cell: (row) => row.email },
      { id: 'rfidUid', header: 'RFID UID', cell: (row) => row.rfidUid },
      { id: 'sectionCount', header: 'Sections', align: 'center', cell: (row) => row.sectionCount },
      {
        id: 'attendanceRate',
        header: 'Attendance %',
        align: 'right',
        cell: (row) => `${row.attendanceRate.toFixed(1)}%`,
      },
      {
        id: 'report',
        header: 'Report',
        align: 'center',
        cell: (row) => (
          <Link
            className="ui-button ui-button--secondary ui-button--sm"
            to={`/students/${row.id}/report`}
            onClick={(event) => event.stopPropagation()}
          >
            Report
          </Link>
        ),
      },
    ],
    [],
  )

  const handleRowClick = useCallback((row: StudentAdminRow) => {
    const sourceStudent = studentsById[row.id]
    if (sourceStudent) {
      setDetailStudent(sourceStudent)
      setIsDetailOpen(true)
    }
  }, [studentsById])

  const handleEditImpl = useCallback(async (row: StudentAdminRow, sourceStudent?: StudentApiResponse) => {
    const src = sourceStudent ?? studentsById[row.id]
    let currentSectionIds: string[] = src?.section_ids ?? []

    if (currentSectionIds.length === 0) {
      try {
        const enrolled = await Promise.all(
          sections.map(async (s) => {
            const students = await listSectionStudentsAdmin(s.id)
            return students.some((st) => st.id === row.id) ? s.id : null
          }),
        )
        currentSectionIds = enrolled.filter(Boolean) as string[]
      } catch {
        currentSectionIds = []
      }
    }

    setEditingId(row.id)
    setFormState({
      fullName: src?.full_name ?? row.fullName,
      email: src?.email ?? row.email,
      phone: src?.phone ?? '',
      rfidUid: src?.rfid_uid ?? row.rfidUid,
      sectionIds: currentSectionIds,
    })
    setFormError(null)
    setIsFormOpen(true)
  }, [studentsById, sections])

  const handleEditFromDetail = useCallback(() => {
    const currentStudent = detailStudent ? studentsById[detailStudent.id] ?? detailStudent : null
    if (!currentStudent) return
    setIsDetailOpen(false)
    const row: StudentAdminRow = {
      id: currentStudent.id,
      fullName: currentStudent.full_name,
      email: currentStudent.email,
      rfidUid: currentStudent.rfid_uid,
      sectionCount: currentStudent.section_ids?.length ?? 0,
      attendanceRate: currentStudent.attendance_rate ?? 0,
    }
    void handleEditImpl(row, currentStudent)
  }, [detailStudent, studentsById, handleEditImpl])

  const handleEdit = useCallback(async (row: StudentAdminRow) => {
    void handleEditImpl(row)
  }, [handleEditImpl])

  const handleDelete = useCallback((row: StudentAdminRow) => {
    setSelectedStudent(row)
    setIsDeleteOpen(true)
  }, [])

  const handleFormSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      const payload = toStudentPayload(formState)
      let savedStudent = editingId
        ? await updateStudentAdmin(editingId, payload)
        : await createStudentAdmin(payload)

      const studentId = savedStudent.id
      const newSectionIds = formState.sectionIds

      if (newSectionIds.length > 0) {
        // If editing, figure out which to add/remove
        const previousIds: string[] = editingId
          ? (studentsById[editingId]?.section_ids ?? [])
          : []

        const toAdd = newSectionIds.filter((id) => !previousIds.includes(id))
        const toRemove = previousIds.filter((id) => !newSectionIds.includes(id))

        await Promise.allSettled([
          ...toAdd.map((sectionId) => enrollStudentToSectionAdmin(sectionId, studentId)),
          ...toRemove.map((sectionId) => removeStudentFromSectionAdmin(sectionId, studentId)),
        ])

        // Patch the saved student's section_ids for correct row count
        savedStudent.section_ids = newSectionIds
      }

      let faceUploadError: string | null = null

      if (selectedFaceFile) {
        try {
          await registerStudentFaceAdmin(savedStudent.id, selectedFaceFile)
          savedStudent = await getStudent(savedStudent.id)
        } catch (faceError) {
          faceUploadError = faceError instanceof Error
            ? faceError.message
            : 'Failed to register student face.'
        }
      }

      syncStudentIntoState(savedStudent)
      if (detailStudent?.id === savedStudent.id) {
        setDetailStudent(savedStudent)
      }

      // Ensure UI is in sync with server state — reload list after save
      void loadStudents()
      setIsFormOpen(false)
      setEditingId(null)
      setFormState(initialStudentForm)
      setSelectedFaceFile(null)

      if (faceUploadError) {
        setFeedbackError(faceUploadError)
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save student.')
    } finally {
      setIsSubmitting(false)
    }
  }, [detailStudent, editingId, formState, loadStudents, selectedFaceFile, syncStudentIntoState, studentsById])

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedStudent) return
    setIsDeleting(true)
    setFeedbackError(null)
    try {
      await deleteStudentAdmin(selectedStudent.id)
      removeStudentFromState(selectedStudent.id)
      setSelectedStudent(null)
      setIsDeleteOpen(false)
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Failed to delete student.')
    } finally {
      setIsDeleting(false)
    }
  }, [removeStudentFromState, selectedStudent])

  const toggleSection = (sectionId: string) => {
    setFormState((current) => ({
      ...current,
      sectionIds: current.sectionIds.includes(sectionId)
        ? current.sectionIds.filter((id) => id !== sectionId)
        : [...current.sectionIds, sectionId],
    }))
  }

  const editingStudent = editingId ? studentsById[editingId] ?? null : null
  const currentDetailStudent = detailStudent ? studentsById[detailStudent.id] ?? detailStudent : null

  const handleFaceFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFaceFile(file)
    event.target.value = ''
  }

  const handleDetailFaceFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''

    if (!file || !currentDetailStudent) {
      return
    }

    setFeedbackError(null)

    try {
      await registerStudentFaceAdmin(currentDetailStudent.id, file)
      const refreshedStudent = await getStudent(currentDetailStudent.id)
      syncStudentIntoState(refreshedStudent)
      setDetailStudent(refreshedStudent)
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Failed to register student face.')
    }
  }

  return (
    <div className="admin-page-stack">
      <section className="admin-page-note">
        <h3>Student records</h3>
        <p>Create, update, and remove student records while keeping identifiers and section assignments consistent.</p>
      </section>

      {feedbackError && (
        <section className="admin-page-alert" role="alert">
          <p>{feedbackError}</p>
          <button type="button" onClick={() => void loadStudents()}>Retry</button>
        </section>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        onEditRow={handleEdit}
        onDeleteRow={handleDelete}
        emptyState={
          <EmptyState
            title="No students loaded"
            description="Create the first student or use retry if the API is temporarily unavailable."
            actionLabel="Add Student"
            onAction={openCreateModal}
          />
        }
      />

      <AdminFormModal
        isOpen={isFormOpen}
        title={editingId ? 'Update Student' : 'Create Student'}
        description="Capture the student profile details required for attendance and enrollment management."
        submitLabel={editingId ? 'Save Student' : 'Create Student'}
        isSubmitting={isSubmitting}
        errorMessage={formError}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      >
        <div className="admin-form-grid">
          <label>
            Full Name
            <input
              value={formState.fullName}
              onChange={(event) => setFormState((current) => ({ ...current, fullName: event.target.value }))}
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>

          <label>
            Phone
            <input
              value={formState.phone}
              onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
            />
          </label>

          <label>
            RFID UID
            <input
              value={formState.rfidUid}
              onChange={(event) => setFormState((current) => ({ ...current, rfidUid: event.target.value }))}
            />
          </label>

          <div className="admin-field-span-2">
            <p className="admin-form-section-label">Face reference image</p>
            <div className="admin-face-upload">
              {selectedFaceFile || editingStudent?.face_reference_image ? (
                <img
                  src={selectedFaceFile ? (facePreviewUrl ?? '') : (editingStudent?.face_reference_image ?? '')}
                  alt="Face reference preview"
                  className="admin-face-upload__image"
                />
              ) : (
                <div className="admin-face-upload__empty">
                  <span>No face image selected yet.</span>
                  <small>The image will be registered after the student is saved.</small>
                </div>
              )}

              <div className="admin-face-upload__actions">
                <p className="admin-page-meta">
                  Upload a clear front-facing photo. Use the detail modal to add or replace it later.
                </p>
                <div className="admin-face-upload__buttons">
                  <button type="button" className="ui-button ui-button--secondary" onClick={() => faceUploadInputRef.current?.click()}>
                    {selectedFaceFile || editingStudent?.face_reference_image ? 'Replace image' : 'Add image'}
                  </button>
                  {selectedFaceFile ? (
                    <button type="button" className="ui-button ui-button--secondary" onClick={() => setSelectedFaceFile(null)}>
                      Remove selected
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <input
              ref={faceUploadInputRef}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={handleFaceFileSelected}
            />
          </div>

          {/* Sections multi-select */}
          {sections.length > 0 && (
            <div className="admin-field-span-2">
              <p className="admin-form-section-label">
                Linked Sections
                {formState.sectionIds.length > 0 && (
                  <span className="admin-section-badge">{formState.sectionIds.length} selected</span>
                )}
              </p>
              <div className="admin-section-list">
                {sections.map((section) => {
                  const checked = formState.sectionIds.includes(section.id)
                  return (
                    <label
                      key={section.id}
                      className={`admin-section-item ${checked ? 'is-checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSection(section.id)}
                      />
                      <span className="admin-section-item__name">{section.section_name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </AdminFormModal>

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        title="Delete Student"
        message={`Delete ${selectedStudent?.fullName ?? 'this student'} from the student directory?`}
        confirmLabel="Delete Student"
        isConfirming={isDeleting}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />

      <StudentDetailModal
        isOpen={isDetailOpen}
        student={currentDetailStudent}
        sections={sections}
        onClose={() => setIsDetailOpen(false)}
        onEdit={handleEditFromDetail}
        onAddFaceImage={() => detailFaceUploadInputRef.current?.click()}
      />

      <input
        ref={detailFaceUploadInputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={handleDetailFaceFileSelected}
      />
    </div>
  )
}

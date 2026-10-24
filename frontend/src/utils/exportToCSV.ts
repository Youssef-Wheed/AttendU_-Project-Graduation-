const escapeCsvValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }

  const serializedValue = String(value)
  const escapedValue = serializedValue.replace(/"/g, '""')
  return /[",\n]/.test(escapedValue) ? `"${escapedValue}"` : escapedValue
}

const sanitizeFilename = (filename: string): string => {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9-_]+/g, '-')
  return normalized || 'export'
}

export const exportToCSV = (
  data: Record<string, unknown>[],
  filename: string,
  options: { includeBom?: boolean } = {},
): void => {
  if (data.length === 0) {
    return
  }

  const allKeys = Array.from(
    data.reduce((accumulator, row) => {
      Object.keys(row).forEach((key) => accumulator.add(key))
      return accumulator
    }, new Set<string>()),
  )

  const csvRows = [
    allKeys.join(','),
    ...data.map((row) =>
      allKeys.map((key) => escapeCsvValue(row[key])).join(','),
    ),
  ]

  const csvContent = csvRows.join('\n')
  const content = options.includeBom ? `\uFEFF${csvContent}` : csvContent
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = `${sanitizeFilename(filename)}.csv`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

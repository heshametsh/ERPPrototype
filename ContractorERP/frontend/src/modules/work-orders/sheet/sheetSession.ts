import type { SavedRow, SaveSheetRequest, SaveSheetResponse, SheetResponse, WorkOrderFields } from '../api'

/**
 * The browser-side truth of one open sheet: current rows, the last saved baseline, and pending deletes.
 * Pure functions only (no React, no grid), so the rules are unit-tested and the grid library can be swapped.
 *
 * Identities (lesson from the prototype):
 *  - key      = browser identity of a row for the whole session (never changes, even after Save)
 *  - id       = database identity (null until first Save)
 *  - version  = database concurrency token
 */

export const editableFields = ['number', 'workTypeCode', 'assignmentDate', 'value', 'partialAmount', 'basket'] as const
export type EditableField = (typeof editableFields)[number]

/** What the employee sees in the grid: every editable cell as text, exactly as typed. */
export type CellValues = Record<EditableField, string>

export type SheetRow = CellValues & {
  key: string
  id: string | null
  version: number | null
  remainingAmount: string
}

export type SheetSession = {
  year: number
  rows: SheetRow[]
  /** Last values the server accepted, per row key. A row without a baseline is new. */
  baseline: Record<string, CellValues>
  deleted: { id: string; version: number }[]
}

let keySeed = 0
export const newKey = () => `new-${Date.now().toString(36)}-${(keySeed++).toString(36)}`

const toCells = (f: WorkOrderFields): CellValues => ({
  number: f.number,
  workTypeCode: f.workTypeCode,
  assignmentDate: f.assignmentDate,
  value: String(f.value),
  partialAmount: f.partialAmount == null ? '' : String(f.partialAmount),
  basket: f.basket,
})

const parseMoney = (text: string): number | null => {
  const clean = text.replace(/,/g, '').trim()
  if (clean === '') return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

/** Remaining = Value - Partial. Derived on every change, never edited, never saved. */
export function remainingOf(cells: CellValues): string {
  const value = parseMoney(cells.value)
  const partial = parseMoney(cells.partialAmount) ?? 0
  if (value === null || Number.isNaN(value) || Number.isNaN(partial)) return ''
  return String(value - partial)
}

const withRemaining = (row: SheetRow): SheetRow => ({ ...row, remainingAmount: remainingOf(row) })

export function fromServer(sheet: SheetResponse): SheetSession {
  const rows = sheet.rows.map((r) => withRemaining({ key: r.id, id: r.id, version: r.version, remainingAmount: '', ...toCells(r) }))
  return {
    year: sheet.year,
    rows,
    baseline: Object.fromEntries(rows.map((r) => [r.key, pickCells(r)])),
    deleted: [],
  }
}

export function pickCells(row: CellValues): CellValues {
  return Object.fromEntries(editableFields.map((f) => [f, row[f]])) as CellValues
}

const isBlank = (row: CellValues) => editableFields.every((f) => row[f].trim() === '')

/** Fields that differ from the saved baseline. A new non-blank row is dirty in every non-empty field. */
export function dirtyFields(session: SheetSession, row: SheetRow): EditableField[] {
  const base = session.baseline[row.key]
  if (!base) return isBlank(row) ? [] : editableFields.filter((f) => row[f].trim() !== '')
  return editableFields.filter((f) => row[f] !== base[f])
}

export function dirtyRowCount(session: SheetSession): number {
  return session.rows.filter((r) => dirtyFields(session, r).length > 0).length + session.deleted.length
}

export function updateCell(session: SheetSession, key: string, field: EditableField, value: string): SheetSession {
  return {
    ...session,
    rows: session.rows.map((r) => (r.key === key ? withRemaining({ ...r, [field]: value }) : r)),
  }
}

export function addBlankRow(session: SheetSession): SheetSession {
  const blank: SheetRow = {
    key: newKey(), id: null, version: null, remainingAmount: '',
    number: '', workTypeCode: '', assignmentDate: '', value: '', partialAmount: '', basket: '',
  }
  return { ...session, rows: [...session.rows, blank] }
}

export function deleteRows(session: SheetSession, keys: string[]): SheetSession {
  const doomed = new Set(keys)
  const saved = session.rows.filter((r) => doomed.has(r.key) && r.id && r.version != null)
  return {
    ...session,
    rows: session.rows.filter((r) => !doomed.has(r.key)),
    deleted: [...session.deleted, ...saved.map((r) => ({ id: r.id!, version: r.version! }))],
  }
}

export type LocalError = { key: string; field: EditableField; message: string }

/** What exactly was sent, so the reply can be applied to that snapshot only (edits made during Save stay dirty). */
export type SentSnapshot = { cells: Record<string, CellValues>; deletedIds: string[] }

export function buildSaveRequest(session: SheetSession, confirmYearMoves: boolean):
  { request: SaveSheetRequest; sent: SentSnapshot } | { errors: LocalError[] } {
  const errors: LocalError[] = []
  const request: SaveSheetRequest = { added: [], updated: [], deleted: [...session.deleted], confirmYearMoves }
  const cells: Record<string, CellValues> = {}

  session.rows.forEach((row, index) => {
    if (dirtyFields(session, row).length === 0) return
    const value = parseMoney(row.value)
    const partial = parseMoney(row.partialAmount)
    if (value === null || Number.isNaN(value)) errors.push({ key: row.key, field: 'value', message: 'قيمة أمر العمل لازم تكون رقم' })
    if (Number.isNaN(partial)) errors.push({ key: row.key, field: 'partialAmount', message: 'المستخلص الجزئي لازم يكون رقم' })
    if (errors.some((e) => e.key === row.key)) return

    const fields: WorkOrderFields = {
      number: row.number.trim(),
      workTypeCode: row.workTypeCode.trim(),
      assignmentDate: row.assignmentDate.trim(),
      value: value!,
      partialAmount: partial,
      basket: row.basket.trim(),
    }
    cells[row.key] = pickCells(row)
    if (row.id && row.version != null) request.updated.push({ id: row.id, version: row.version, fields, displayOrder: index })
    else request.added.push({ clientKey: row.key, fields, displayOrder: index })
  })

  if (errors.length > 0) return { errors }
  return { request, sent: { cells, deletedIds: session.deleted.map((d) => d.id) } }
}

/** Apply a successful Save to the session as it is NOW (the employee may have kept typing while it ran). */
export function applySaveResponse(session: SheetSession, sent: SentSnapshot, response: SaveSheetResponse): SheetSession {
  const savedByKey = new Map<string, SavedRow>()
  for (const a of response.added) savedByKey.set(a.clientKey!, a)
  const keyById = new Map(session.rows.filter((r) => r.id).map((r) => [r.id!, r.key]))
  for (const u of response.updated) {
    const key = keyById.get(u.id)
    if (key) savedByKey.set(key, u)
  }

  const baseline = { ...session.baseline }
  const movedToOtherYear = new Set<string>()
  const rows = session.rows.map((row) => {
    const saved = savedByKey.get(row.key)
    if (!saved) return row
    baseline[row.key] = sent.cells[row.key]
    if (saved.workYear !== session.year) movedToOtherYear.add(row.key)
    return { ...row, id: saved.id, version: saved.version }
  })

  const next = { ...session, baseline }
  const done = new Set(sent.deletedIds)
  return {
    ...next,
    // A row moved to another year by its Assignment Date leaves this sheet, unless it was edited again during Save.
    rows: rows.filter((r) => !movedToOtherYear.has(r.key) || dirtyFields(next, r).length > 0),
    deleted: session.deleted.filter((d) => !done.has(d.id)),
  }
}

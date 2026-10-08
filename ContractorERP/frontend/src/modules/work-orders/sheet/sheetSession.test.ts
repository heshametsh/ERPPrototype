import { describe, expect, it } from 'vitest'
import type { SheetResponse } from '../api'
import { addBlankRow, applySaveResponse, buildSaveRequest, deleteRows, dirtyFields, dirtyRowCount, fromServer, updateCell } from './sheetSession'

const sheet: SheetResponse = {
  year: 2026,
  availableYears: [2026],
  rows: [{ id: 'a', version: 7, number: '123456789', workTypeCode: '001', assignmentDate: '2026-03-01', value: 1000, partialAmount: 250, remainingAmount: 750, basket: 'التنفيذ', displayOrder: 0 }],
}

describe('sheet session', () => {
  it('starts clean and derives remaining', () => {
    const s = fromServer(sheet)
    expect(dirtyRowCount(s)).toBe(0)
    expect(s.rows[0].remainingAmount).toBe('750')
  })

  it('tracks exactly the edited field and recalculates remaining', () => {
    const s = updateCell(fromServer(sheet), 'a', 'partialAmount', '400')
    expect(dirtyFields(s, s.rows[0])).toEqual(['partialAmount'])
    expect(s.rows[0].remainingAmount).toBe('600')
  })

  it('editing back to the saved value makes the row clean again', () => {
    let s = updateCell(fromServer(sheet), 'a', 'basket', 'الحفر')
    s = updateCell(s, 'a', 'basket', 'التنفيذ')
    expect(dirtyRowCount(s)).toBe(0)
  })

  it('a blank new row is not a change', () => {
    expect(dirtyRowCount(addBlankRow(fromServer(sheet)))).toBe(0)
  })

  it('builds added / updated / deleted with versions', () => {
    let s = addBlankRow(fromServer(sheet))
    const newKey = s.rows[1].key
    s = updateCell(s, newKey, 'number', '987654321')
    s = updateCell(s, newKey, 'value', '500')
    const built = buildSaveRequest(deleteRows(s, ['a']), false)
    if ('errors' in built) throw new Error('unexpected')
    expect(built.request.added).toHaveLength(1)
    expect(built.request.added[0].clientKey).toBe(newKey)
    expect(built.request.deleted).toEqual([{ id: 'a', version: 7 }])
  })

  it('rejects non-numeric money before sending', () => {
    const built = buildSaveRequest(updateCell(fromServer(sheet), 'a', 'value', 'abc'), false)
    expect('errors' in built && built.errors[0].field).toBe('value')
  })

  it('an edit made while Save was running stays dirty after the reply', () => {
    let s = updateCell(fromServer(sheet), 'a', 'value', '2000')
    const built = buildSaveRequest(s, false)
    if ('errors' in built) throw new Error('unexpected')

    s = updateCell(s, 'a', 'value', '3000') // typed during Save
    s = applySaveResponse(s, built.sent, { added: [], updated: [{ clientKey: null, id: 'a', version: 8, workYear: 2026 }], deleted: [] })

    expect(s.rows[0].version).toBe(8)
    expect(dirtyFields(s, s.rows[0])).toEqual(['value'])
    expect(s.baseline.a.value).toBe('2000')
  })

  it('a new row keeps its browser key after it gets a database id', () => {
    let s = addBlankRow(fromServer(sheet))
    const key = s.rows[1].key
    s = updateCell(updateCell(updateCell(s, key, 'number', '111111111'), key, 'value', '10'), key, 'assignmentDate', '2026-05-05')
    const built = buildSaveRequest(s, false)
    if ('errors' in built) throw new Error('unexpected')
    s = applySaveResponse(s, built.sent, { added: [{ clientKey: key, id: 'db-1', version: 1, workYear: 2026 }], updated: [], deleted: [] })
    expect(s.rows[1]).toMatchObject({ key, id: 'db-1', version: 1 })
    expect(dirtyRowCount(s)).toBe(0)
  })
})

describe('year move', () => {
  it('a saved row moved to another year leaves the open sheet', () => {
    let s = updateCell(fromServer(sheet), 'a', 'assignmentDate', '2027-01-02')
    const built = buildSaveRequest(s, true)
    if ('errors' in built) throw new Error('unexpected')
    s = applySaveResponse(s, built.sent, { added: [], updated: [{ clientKey: null, id: 'a', version: 9, workYear: 2027 }], deleted: [] })
    expect(s.rows).toHaveLength(0)
  })
})

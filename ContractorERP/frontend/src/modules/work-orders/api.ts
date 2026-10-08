import { http } from '../../shared/api/http'

/** Shapes match the server contracts in backend/src/Modules/WorkOrders/Application/Contracts.cs. */
export type WorkOrderFields = {
  number: string
  workTypeCode: string
  assignmentDate: string // yyyy-MM-dd
  value: number
  partialAmount: number | null
  basket: string
}

export type WorkOrderRow = WorkOrderFields & {
  id: string
  remainingAmount: number
  displayOrder: number
  version: number
}

export type SheetResponse = { year: number; availableYears: number[]; rows: WorkOrderRow[] }

export type SaveSheetRequest = {
  added: { clientKey: string; fields: WorkOrderFields; displayOrder: number }[]
  updated: { id: string; version: number; fields: WorkOrderFields; displayOrder: number }[]
  deleted: { id: string; version: number }[]
  confirmYearMoves: boolean
}

export type SavedRow = { clientKey: string | null; id: string; version: number; workYear: number }

export type SaveSheetResponse = { added: SavedRow[]; updated: SavedRow[]; deleted: string[] }

export const workOrdersApi = {
  sheet: (year?: number) => http.get<SheetResponse>(`/api/work-orders/sheet${year ? `?year=${year}` : ''}`),
  save: (request: SaveSheetRequest) => http.post<SaveSheetResponse>('/api/work-orders/sheet', request),
}

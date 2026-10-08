import { useMemo } from 'react'
import { RevoGrid, type AfterEditEvent, type ColumnRegular, type RevoGridCustomEvent } from '@revolist/react-datagrid'
import { useTranslation } from 'react-i18next'
import { dirtyFields, editableFields, type EditableField, type SheetRow, type SheetSession } from './sheetSession'

/**
 * The ONLY file that knows the grid library (RevoGrid Community, MIT).
 * It translates grid events into session changes and session state into cell styles.
 * Replacing the grid library later means rewriting this file, not the sheet rules.
 */

export type CellEdit = { key: string; field: EditableField; value: string }

type Props = {
  session: SheetSession
  errors: Record<string, string> // "rowKey:field" -> message
  onEdit: (edits: CellEdit[]) => void
}

const isEditable = (prop: unknown): prop is EditableField => editableFields.includes(prop as EditableField)

export function WorkOrdersGrid({ session, errors, onEdit }: Props) {
  const { t } = useTranslation()

  const columns = useMemo<ColumnRegular[]>(() => {
    const cellClass = (field: string): ColumnRegular['cellProperties'] => (props) => {
      const model = props.model as SheetRow
      const classes: string[] = []
      if (field === 'remainingAmount') classes.push('cell-readonly')
      else if (dirtyFields(session, model).includes(field as EditableField)) classes.push('cell-dirty')
      const error = errors[`${model.key}:${field}`] ?? errors[model.id ? `${model.id}:${field}` : '']
      if (error) classes.push('cell-error')
      return { class: classes.join(' '), title: error ?? undefined }
    }

    const col = (prop: string, size: number, readonly = false): ColumnRegular => ({
      prop,
      name: t(`workOrders.columns.${prop}`),
      size,
      readonly,
      cellProperties: cellClass(prop),
    })

    return [
      col('number', 150),
      col('workTypeCode', 100),
      col('assignmentDate', 130),
      col('value', 150),
      col('partialAmount', 150),
      col('remainingAmount', 150, true),
      col('basket', 200),
    ]
  }, [session, errors, t])

  const handleAfterEdit = (event: RevoGridCustomEvent<AfterEditEvent>) => {
    const detail = event.detail
    const edits: CellEdit[] = []
    if ('models' in detail) {
      // Paste / range edit: one user action, many cells.
      for (const [rowIndex, changes] of Object.entries(detail.data)) {
        const model = detail.models[Number(rowIndex)] as SheetRow | undefined
        if (!model) continue
        for (const [prop, value] of Object.entries(changes as Record<string, unknown>)) {
          if (isEditable(prop)) edits.push({ key: model.key, field: prop, value: String(value ?? '') })
        }
      }
    } else if (isEditable(detail.prop)) {
      edits.push({ key: (detail.model as SheetRow).key, field: detail.prop, value: String(detail.val ?? '') })
    }
    if (edits.length > 0) onEdit(edits)
  }

  return (
    <div className="sheet-host">
      <RevoGrid
        source={session.rows}
        columns={columns}
        range
        resize
        rowHeaders
        onAfteredit={handleAfterEdit}
      />
    </div>
  )
}

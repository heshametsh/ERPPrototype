import { useState } from 'react'
import { Badge, Button, Group, Select, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../shared/api/http'
import { workOrdersApi } from './api'
import { addBlankRow, applySaveResponse, buildSaveRequest, dirtyRowCount, fromServer, updateCell, type SheetSession } from './sheet/sheetSession'
import { WorkOrdersGrid, type CellEdit } from './sheet/WorkOrdersGrid'

export function WorkOrdersPage() {
  const { t } = useTranslation()
  const [year, setYear] = useState<number | undefined>()
  const [session, setSession] = useState<SheetSession | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const sheet = useQuery({ queryKey: ['work-orders', 'sheet', year], queryFn: () => workOrdersApi.sheet(year) })

  // A year switch replaces the session only after the new year loaded successfully.
  const [loaded, setLoaded] = useState(sheet.data)
  if (sheet.data && sheet.data !== loaded) {
    setLoaded(sheet.data)
    setSession(fromServer(sheet.data))
    setErrors({})
  }

  const pending = session ? dirtyRowCount(session) : 0

  const onEdit = (edits: CellEdit[]) =>
    setSession((s) => (s ? edits.reduce((acc, e) => updateCell(acc, e.key, e.field, e.value), s) : s))

  const save = async (confirmYearMoves = false) => {
    if (!session) return
    if (pending === 0) {
      notifications.show({ message: t('workOrders.nothingToSave') })
      return
    }
    const built = buildSaveRequest(session, confirmYearMoves)
    if ('errors' in built) {
      setErrors(Object.fromEntries(built.errors.map((e) => [`${e.key}:${e.field}`, e.message])))
      return
    }

    setSaving(true)
    try {
      const response = await workOrdersApi.save(built.request)
      setSession((current) => (current ? applySaveResponse(current, built.sent, response) : current))
      setErrors({})
      notifications.show({ color: 'teal', message: t('workOrders.saved') })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.errors.some((e) => e.code === 'year_move_needs_confirmation') && window.confirm(t('workOrders.confirmYearMove'))) {
        setSaving(false)
        return save(true)
      }
      // Nothing was saved (one transaction). Changes stay dirty and every bad cell is marked.
      setErrors(Object.fromEntries(error.errors.filter((e) => e.target).map((e) => [e.target!.includes(':') ? e.target! : `${e.target}:number`, e.message])))
      notifications.show({ color: 'red', title: t('workOrders.saveFailed'), message: error.errors[0]?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Group justify="space-between" mb="sm">
        <Group>
          <Title order={3}>{t('workOrders.title')}</Title>
          {pending > 0 && <Badge color="yellow">{t('workOrders.unsaved', { count: pending })}</Badge>}
        </Group>
        <Group>
          <Select
            w={110}
            aria-label={t('workOrders.year')}
            data={(sheet.data?.availableYears ?? []).map(String)}
            value={session ? String(session.year) : null}
            onChange={(v) => v && setYear(Number(v))}
            disabled={pending > 0}
          />
          <Button variant="default" onClick={() => setSession((s) => (s ? addBlankRow(s) : s))}>{t('workOrders.addRow')}</Button>
          <Button onClick={() => void save()} loading={saving}>{t('workOrders.save')}</Button>
        </Group>
      </Group>
      {session && <WorkOrdersGrid session={session} errors={errors} onEdit={onEdit} />}
    </>
  )
}

import { AppShell, Button, Group, Text, Title } from '@mantine/core'
import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLogout, useMe } from '../modules/auth/useMe'

export function AppShellLayout() {
  const { t } = useTranslation()
  const me = useMe()
  const logout = useLogout()

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>{t('app.title')}</Title>
          <Group>
            <Text size="sm">{me.data?.fullName}</Text>
            <Button variant="subtle" size="xs" onClick={() => logout.mutate()}>{t('auth.logout')}</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}

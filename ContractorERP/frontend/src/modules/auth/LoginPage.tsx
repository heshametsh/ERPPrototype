import { useState } from 'react'
import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../shared/api/http'
import { authApi } from './api'
import { meKey } from './useMe'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => authApi.login(userName, password),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meKey })
      void navigate('/', { replace: true })
    },
  })

  const errorText = login.error instanceof ApiError && login.error.errors[0]?.code === 'account_locked'
    ? t('auth.locked')
    : t('auth.invalid')

  return (
    <Center h="100vh" bg="gray.0">
      <Paper withBorder shadow="sm" p="xl" w={360}>
        <form onSubmit={(e) => { e.preventDefault(); login.mutate() }}>
          <Stack>
            <Title order={3}>{t('auth.title')}</Title>
            {login.isError && <Alert color="red">{errorText}</Alert>}
            <TextInput label={t('auth.userName')} value={userName} onChange={(e) => setUserName(e.currentTarget.value)} autoFocus required />
            <PasswordInput label={t('auth.password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
            <Button type="submit" loading={login.isPending}>{t('auth.login')}</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}

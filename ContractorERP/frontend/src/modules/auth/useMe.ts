import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { authApi } from './api'

export const meKey = ['auth', 'me'] as const

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: authApi.me, retry: false, staleTime: 60_000 })
}

export function useLogout() {
  const client = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      client.clear()
      void navigate('/login', { replace: true })
    },
  })
}

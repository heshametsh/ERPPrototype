import type { ReactNode } from 'react'
import { Center, Loader } from '@mantine/core'
import { Navigate } from 'react-router'
import { useMe } from './useMe'

/** Shows the page only to a signed-in user. The server still checks every request. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me.isPending) return <Center h="100vh"><Loader /></Center>
  if (me.isError) return <Navigate to="/login" replace />
  return children
}

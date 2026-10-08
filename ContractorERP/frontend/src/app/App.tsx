import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './app.css'
import '../shared/i18n'
import { DirectionProvider, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { theme } from './theme'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export function App() {
  return (
    <DirectionProvider initialDirection="rtl">
      <MantineProvider theme={theme}>
        <Notifications position="top-center" />
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </MantineProvider>
    </DirectionProvider>
  )
}

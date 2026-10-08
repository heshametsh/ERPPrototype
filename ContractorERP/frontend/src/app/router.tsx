import { createBrowserRouter, Navigate } from 'react-router'
import { LoginPage } from '../modules/auth/LoginPage'
import { RequireAuth } from '../modules/auth/RequireAuth'
import { AppShellLayout } from './AppShellLayout'
import { WorkOrdersPage } from '../modules/work-orders/WorkOrdersPage'

// Every new module adds its screens here.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth><AppShellLayout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/work-orders" replace /> },
      { path: '/work-orders', element: <WorkOrdersPage /> },
    ],
  },
])

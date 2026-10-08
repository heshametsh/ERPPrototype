import { http } from '../../shared/api/http'

export type Me = {
  id: string
  userName: string
  fullName: string
  roles: string[]
  branchId: string | null
  departmentId: string | null
  mustChangePassword: boolean
}

export const authApi = {
  me: () => http.get<Me>('/api/auth/me'),
  login: (userName: string, password: string) => http.post<void>('/api/auth/login', { userName, password }),
  logout: () => http.post<void>('/api/auth/logout'),
}

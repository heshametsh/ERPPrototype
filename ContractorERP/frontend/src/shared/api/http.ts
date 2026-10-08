// The only place that talks to the server. Cookies carry the login; the browser never sends department/branch.

export type ServerError = { kind: string; code: string; message: string; target?: string | null }

export class ApiError extends Error {
  readonly status: number
  readonly errors: ServerError[]

  constructor(status: number, errors: ServerError[]) {
    super(errors[0]?.message ?? `HTTP ${status}`)
    this.status = status
    this.errors = errors
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T
  const text = await response.text()
  const json = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    const errors: ServerError[] = json?.errors && Array.isArray(json.errors)
      ? json.errors
      : [{ kind: 'Http', code: json?.title ?? String(response.status), message: json?.title ?? `HTTP ${response.status}` }]
    throw new ApiError(response.status, errors)
  }
  return json as T
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
}

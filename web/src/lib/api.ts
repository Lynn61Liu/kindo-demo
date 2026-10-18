export type Student = { id: number; name: string; parent: { id: number; name: string } }
export type Payment = {
  id: number
  payer_id: number
  amount_cents: number
  status: string
  provider_reference: string
  created_at: string
}
export type PaymentRequest = {
  id: number
  student: { id: number; name: string }
  parent: { id: number; name: string }
  created_by: number
  title: string
  description: string | null
  amount_cents: number
  currency: string
  due_date: string | null
  status: 'open' | 'paid'
  created_at: string
  paid_at: string | null
  payment: Payment | null
}
export type RequestFilter = 'all' | 'open' | 'paid'

const apiRoot = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function requestJson<T>(path: string, userId: number, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiRoot}/api/v1${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-User-Id': String(userId),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Could not reach the API. Check that the backend is running.', 0)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? String((detail[0] as { msg?: unknown } | undefined)?.msg ?? 'Please check the form fields.')
        : typeof detail === 'object' && detail !== null && 'message' in detail
          ? String((detail as { message: unknown }).message)
          : `Request failed (${response.status}).`
    throw new ApiError(message, response.status)
  }
  return body as T
}

export function getAdminStudents(userId: number) {
  return requestJson<{ items: Student[] }>('/admin/students', userId)
}

export function getAdminRequests(userId: number, status: RequestFilter) {
  const query = status === 'all' ? '' : `?status=${status}`
  return requestJson<{ items: PaymentRequest[] }>(`/admin/payment-requests${query}`, userId)
}

export type CreateRequestBody = {
  student_id: number
  title: string
  description: string | null
  amount_cents: number
  due_date: string | null
}

export function createPaymentRequest(userId: number, body: CreateRequestBody) {
  return requestJson<PaymentRequest>('/payment-requests', userId, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

import Constants from 'expo-constants';
import type { PaymentRequest, PaymentRequestList, PaymentStatus } from './types';
export type { PaymentRequest, PaymentRequestList, PaymentStatus } from './types';

const configuredUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || configuredUrl || 'http://127.0.0.1:8000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(
  path: string,
  userId: number,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        'X-Demo-User-Id': String(userId),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Could not connect to the demo server. Check the connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  let payload: unknown;
  try {
    payload = contentType.includes('application/json') ? await response.json() : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'object' && detail !== null && 'message' in detail) {
      const body = detail as { message?: unknown; code?: unknown };
      throw new ApiError(
        typeof body.message === 'string' ? body.message : 'The request could not be completed.',
        response.status,
        typeof body.code === 'string' ? body.code : undefined,
      );
    }
    throw new ApiError(`The request could not be completed (${response.status}).`, response.status);
  }
  if (!payload || typeof payload !== 'object') throw new ApiError('The server returned an unreadable response.', response.status);
  return payload as T;
}

export async function getRequests(
  userId: number,
  status: PaymentStatus,
  signal?: AbortSignal,
): Promise<PaymentRequestList> {
  const result = await requestJson<PaymentRequestList>(`/payment-requests?status=${status}`, userId, signal);
  if (!result || !Array.isArray(result.items)) throw new ApiError('The server returned an invalid request list.');
  return result;
}

export async function getRequest(userId: number, requestId: number, signal?: AbortSignal): Promise<PaymentRequest> {
  return requestJson<PaymentRequest>(`/payment-requests/${requestId}`, userId, signal);
}

export async function simulatePayment(userId: number, requestId: number, signal?: AbortSignal): Promise<PaymentRequest> {
  return requestJson<PaymentRequest>(`/payment-requests/${requestId}/simulate-payment`, userId, signal, {
    method: 'POST',
  });
}

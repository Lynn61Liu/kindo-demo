import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAdminRequests } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('admin API errors', () => {
  it('keeps a useful structured server message and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'Administrator access is required.' }),
      { status: 403 },
    )))

    await expect(getAdminRequests(1, 'all')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Administrator access is required.',
      status: 403,
    })
  })

  it('explains a network failure without exposing a low-level fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(getAdminRequests(1, 'paid')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Could not reach the API. Check that the backend is running.',
      status: 0,
    })
  })
})

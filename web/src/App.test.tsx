import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const students = {
  items: [
    { id: 101, name: 'Student A1', parent: { id: 2, name: 'Parent A' } },
    { id: 102, name: 'Student A2', parent: { id: 2, name: 'Parent A' } },
  ],
}

function request(title: string, id = 501) {
  return {
    id,
    student: { id: 101, name: 'Student A1' },
    parent: { id: 2, name: 'Parent A' },
    created_by: 1,
    title,
    description: 'Museum visit',
    amount_cents: 1250,
    currency: 'NZD',
    due_date: '2026-11-01',
    status: 'open',
    created_at: '2026-10-18T00:00:00Z',
    paid_at: null,
    payment: null,
  }
}

function installFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init)
    return new Response(JSON.stringify(body), { status: (body as { __status?: number }).__status ?? 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin payable workflow', () => {
  it('loads Payable Status from the admin API and renders an expanded detail', async () => {
    installFetch((url) => url.includes('/admin/students') ? students : { items: [request('School trip')] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Payable Status' })).toBeInTheDocument()
    expect(await screen.findByText('School trip')).toBeInTheDocument()
    expect(screen.getByText('Student A1')).toBeInTheDocument()
    expect(screen.getByText('NZ$12.50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^School trip$/ }))
    expect(await screen.findByText('Museum visit')).toBeInTheDocument()
    expect(screen.getAllByText('Parent A', { exact: true }).length).toBeGreaterThanOrEqual(2)
    const titleButton = screen.getByRole('button', { name: 'School trip' })
    expect(titleButton).toHaveAttribute('aria-expanded', 'true')
    expect(titleButton).toHaveAttribute('aria-controls', 'payment-request-501-details')
    fireEvent.click(titleButton)
    expect(titleButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the paid status and the payment date in the status table', async () => {
    installFetch((url) => url.includes('/admin/students') ? students : {
      items: [{ ...request('Paid camp', 503), status: 'paid', paid_at: '2026-10-17T23:30:00Z' }],
    })
    render(<App />)

    await screen.findByText('18 Oct 2026')
    expect(screen.getByRole('table').querySelector('[role="status"]')).toHaveTextContent('Paid')
    expect(screen.getByText('18 Oct 2026')).toBeInTheDocument()
  })

  it('keeps row controls available beside maximum-length names, titles, and amounts', async () => {
    const longName = 'Student'.repeat(17)
    const longTitle = 'Fieldtrip'.repeat(13)
    const row = {
      ...request(longTitle),
      student: { id: 101, name: longName },
      parent: { id: 2, name: 'Parent'.repeat(18) },
      amount_cents: 100_000_000,
    }
    installFetch((url) => url.includes('/admin/students') ? students : { items: [row] })
    render(<App />)

    expect(await screen.findByText(longName)).toBeInTheDocument()
    expect(screen.getByText('NZ$1,000,000.00')).toBeInTheDocument()
    const titleButton = screen.getByRole('button', { name: longTitle })
    expect(titleButton).toHaveClass('wrap-anywhere')
    expect(screen.getByRole('button', { name: `View ${longTitle} details` })).toBeInTheDocument()
    expect(titleButton.closest('.overflow-x-auto')).toHaveClass('overflow-x-auto')
  })

  it('filters open and paid requests and refreshes from the API', async () => {
    const calls: string[] = []
    installFetch((url) => {
      calls.push(url)
      if (url.includes('/admin/students')) return students
      if (url.includes('status=paid')) return { items: [request('Paid trip')] }
      if (url.includes('status=open')) return { items: [request('Open trip')] }
      return { items: [request('Open trip'), { ...request('Paid trip', 502), status: 'paid' }] }
    })
    render(<App />)

    expect(await screen.findByText('Open trip')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Payment request status' })).getByRole('button', { name: 'Paid' }))
    expect(await screen.findByText('Paid trip')).toBeInTheDocument()
    expect(calls.some((url) => url.includes('status=paid'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(calls.filter((url) => url.includes('status=paid'))).toHaveLength(2))
  })

  it('discards an older filter response after the user switches filters quickly', async () => {
    const all = deferred<Response>()
    const open = deferred<Response>()
    const paid = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/admin/students')) return Promise.resolve(ok(students))
      if (url.includes('status=open')) return open.promise
      if (url.includes('status=paid')) return paid.promise
      return all.promise
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    expect(await screen.findByText('Loading payment requests…')).toBeInTheDocument()
    const filters = within(screen.getByRole('group', { name: 'Payment request status' }))
    fireEvent.click(filters.getByRole('button', { name: 'No payments' }))
    fireEvent.click(filters.getByRole('button', { name: 'Paid' }))

    paid.resolve(ok({ items: [{ ...request('Newest paid result'), status: 'paid' }] }))
    expect(await screen.findByText('Newest paid result')).toBeInTheDocument()
    open.resolve(ok({ items: [request('Stale open result')] }))
    all.resolve(ok({ items: [request('Stale all result')] }))

    await waitFor(() => expect(screen.queryByText('Stale open result')).not.toBeInTheDocument())
    expect(screen.queryByText('Stale all result')).not.toBeInTheDocument()
    expect(screen.getByText('Newest paid result')).toBeInTheDocument()
  })

  it('creates with cents from the selected student and guards duplicate submission', async () => {
    const created = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/admin/students')) return Promise.resolve(ok(students))
      if (init?.method === 'POST') return created.promise
      return Promise.resolve(ok({ items: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Create payable/ }))

    fireEvent.change(screen.getByLabelText('Student'), { target: { value: '102' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'School trip' } })
    fireEvent.change(screen.getByLabelText('Amount (NZD)'), { target: { value: '12.50' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Museum visit' } })
    const submit = within(screen.getByRole('form')).getByRole('button', { name: 'Create payable' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
    expect(submit).toBeDisabled()
    created.resolve(ok(request('School trip')))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/payment-requests'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Demo-User-Id': '1' }),
        body: JSON.stringify({
          student_id: 102,
          title: 'School trip',
          description: 'Museum visit',
          amount_cents: 1250,
          due_date: null,
        }),
      }),
    ))
    expect(await screen.findByText(/created successfully/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('keeps invalid amount input in the form and blocks submission', async () => {
    const fetchMock = installFetch((url) => url.includes('/admin/students') ? students : { items: [] })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Create payable/ }))
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: '101' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByLabelText('Amount (NZD)'), { target: { value: '12.501' } })
    fireEvent.click(within(screen.getByRole('form')).getByRole('button', { name: 'Create payable' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Use an amount with up to two decimal places/)
    expect(screen.getByLabelText('Title')).toHaveValue('Trip')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('associates field validation messages with their invalid controls', async () => {
    const fetchMock = installFetch((url) => url.includes('/admin/students') ? students : { items: [] })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Create payable/ }))
    fireEvent.click(within(screen.getByRole('form')).getByRole('button', { name: 'Create payable' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a student')
    expect(screen.getByLabelText('Student')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-describedby', 'title-error')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Amount (NZD)')).toHaveAttribute('aria-describedby', 'amount-error')
    expect(screen.getByText('Enter a title between 1 and 120 characters.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)

    fireEvent.change(screen.getByLabelText('Student'), { target: { value: '101' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByLabelText('Amount (NZD)'), { target: { value: '12.50' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })

  it('returns from Create Payable through the brand link and reloads the current list', async () => {
    const calls: string[] = []
    installFetch((url) => {
      calls.push(url)
      if (url.includes('/admin/students')) return students
      return { items: [request('Current payable')] }
    })
    render(<App />)
    expect(await screen.findByText('Current payable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Create payable/ }))
    expect(await screen.findByRole('heading', { name: 'Create Payable' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Kindo School payments/ }))

    expect(await screen.findByRole('heading', { name: 'Payable Status' })).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((url) => url.includes('/admin/payment-requests'))).toHaveLength(2))
    expect(screen.getByText('Current payable')).toBeInTheDocument()
  })

  it('shows server validation errors and preserves form values', async () => {
    installFetch((url, init) => {
      if (url.includes('/admin/students')) return students
      if (init?.method === 'POST') return Object.assign({ detail: [{ msg: 'Student is not available' }] }, { __status: 422 })
      return { items: [] }
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Create payable/ }))
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: '101' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByLabelText('Amount (NZD)'), { target: { value: '12.50' } })
    fireEvent.click(within(screen.getByRole('form')).getByRole('button', { name: 'Create payable' }))
    expect(await screen.findByText('Student is not available')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Trip')
  })

  it('shows an empty state and retries a failed load', async () => {
    let fail = true
    installFetch((url) => {
      if (url.includes('/admin/students')) return students
      if (fail) return Object.assign({ detail: { message: 'Offline' } }, { __status: 500 })
      return { items: [] }
    })
    render(<App />)
    expect(await screen.findByText(/Could not load payment requests/)).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No payment requests yet/)).toBeInTheDocument()
  })
})

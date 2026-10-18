import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  createPaymentRequest,
  getAdminRequests,
  getAdminStudents,
  type PaymentRequest,
  type RequestFilter,
  type Student,
} from './lib/api'
import { formatNzd, parseNzdToCents } from './lib/money'

const filters: { id: RequestFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'No payments' },
  { id: 'paid', label: 'Paid' },
]

const primaryButton = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[5px] border border-kindo bg-kindo px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:border-[#005461] hover:bg-[#005461] focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const quietButton = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[5px] border border-transparent bg-transparent px-2.5 text-[13px] font-semibold text-[#526264] transition-colors hover:bg-[#edf7f6] hover:text-kindo focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const outlineButton = 'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[5px] border border-[#8cabad] bg-white px-3.5 text-[13px] font-semibold text-kindo transition-colors hover:border-kindo hover:bg-[#f4faf9] focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'

function dateLabel(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeZone: 'Pacific/Auckland' }).format(new Date(value))
}

function App() {
  const [page, setPage] = useState<'list' | 'create'>('list')
  const [filter, setFilter] = useState<RequestFilter>('all')
  const [refreshCount, setRefreshCount] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const requestKey = `${filter}:${refreshCount}`
  const [requestData, setRequestData] = useState<{
    key: string; items: PaymentRequest[]; loading: boolean; error: string
  }>({ key: '', items: [], loading: true, error: '' })
  const [studentData, setStudentData] = useState<{
    items: Student[]; loading: boolean; error: string
  }>({ items: [], loading: true, error: '' })
  const requestView = requestData.key === requestKey
    ? requestData
    : { key: requestKey, items: [], loading: true, error: '' }

  useEffect(() => {
    let active = true
    void getAdminRequests(1, filter).then((result) => {
      if (active) setRequestData({ key: requestKey, items: result.items, loading: false, error: '' })
    }).catch((error: unknown) => {
      if (active) setRequestData({
        key: requestKey,
        items: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load payment requests.',
      })
    })
    return () => { active = false }
  }, [filter, refreshCount, requestKey])

  useEffect(() => {
    let active = true
    void getAdminStudents(1).then((result) => {
      if (active) setStudentData({ items: result.items, loading: false, error: '' })
    }).catch((error: unknown) => {
      if (active) setStudentData({
        items: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load students.',
      })
    })
    return () => { active = false }
  }, [])

  function openCreate() {
    setNotice('')
    setPage('create')
  }

  function showList() {
    setPage('list')
    setRefreshCount((value) => value + 1)
  }

  return (
    <main className="mx-auto flex min-h-screen w-[calc(100%-48px)] max-w-[1200px] flex-col max-[720px]:w-[calc(100%-28px)]">
      <header className="flex min-h-[70px] items-center justify-between border-b border-kindo/10 max-[720px]:min-h-[62px]">
        <a className="inline-flex items-center gap-2.5 text-[17px] leading-[1.15] font-bold text-kindo no-underline" href="#status" onClick={(event) => { event.preventDefault(); showList() }}>
          <span aria-hidden="true" className="grid size-[34px] place-items-center rounded-full bg-kindo text-[19px] font-semibold text-white">K</span>
          <span>Kindo <small className="mt-[3px] block text-[10px] font-normal tracking-wide text-[#68787a]">School payments</small></span>
        </a>
        <div className="flex items-center gap-[9px] text-[12px] text-[#606a6a] max-[720px]:gap-1.5">
          <span className="max-[720px]:hidden">Demo identity</span>
          <strong className="rounded-[5px] border border-border bg-white px-2.5 py-[7px] text-[12px] font-semibold text-[#3e5153] max-[720px]:px-[7px] max-[720px]:text-[11px]">Demo Admin · 1</strong>
        </div>
      </header>

      {page === 'list' ? (
        <section className="flex-1 py-[34px] pb-12 max-[720px]:pt-[25px]">
          <div className="mb-5 mx-1 flex items-end justify-between gap-6 max-[420px]:flex-col max-[420px]:items-start max-[420px]:gap-3">
            <div>
              <p className="mb-[5px] text-[10px] font-bold tracking-[.11em] text-[#708083]">PAYMENTS</p>
              <h1 className="m-0 text-[28px] leading-[1.2] font-semibold tracking-[-.45px] text-kindo max-[720px]:text-[24px]">Payable Status</h1>
            </div>
            <button className={primaryButton} type="button" onClick={openCreate}>＋ <span>Create payable</span></button>
          </div>
          <div className="min-h-[300px] overflow-hidden rounded-[20px] border border-[#e4e9e9] bg-white shadow-[0_3px_14px_#20545a0b] max-[720px]:rounded-[14px]">
            <div className="flex min-h-[57px] items-center justify-between border-b border-divider px-5 max-[720px]:px-3">
              <div className="flex self-stretch items-stretch gap-5 max-[720px]:gap-[13px]" role="group" aria-label="Payment request status">
                {filters.map((item) => (
                  <button key={item.id} type="button"
                    className={`relative cursor-pointer border-0 bg-transparent px-0.5 text-[13px] transition-colors hover:text-kindo max-[720px]:text-[12px] ${filter === item.id ? 'font-semibold text-kindo' : 'text-[#687272]'} ${filter === item.id ? 'after:absolute after:right-0 after:bottom-[-1px] after:left-0 after:h-[3px] after:bg-kindo-soft after:content-[""]' : ''}`}
                    aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setExpandedId(null); setNotice('') }}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button className={quietButton} type="button" onClick={() => setRefreshCount((value) => value + 1)} disabled={requestView.loading}>
                <RefreshIcon /> Refresh
              </button>
            </div>
            {notice && <p role="status" className="mx-5 mt-3.5 rounded-[5px] border border-[#b9d8c0] bg-[#f3faf4] px-3 py-2.5 text-[13px] text-success">{notice}</p>}
            {requestView.error ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 p-7 text-center text-[13px] text-[#6d7777]" role="alert">
                <strong className="text-[15px] text-danger">Could not load payment requests</strong>
                <span className="max-w-[520px]">{requestView.error}</span>
                <button className={`${outlineButton} mt-2`} type="button" onClick={() => setRefreshCount((value) => value + 1)}>Retry</button>
              </div>
            ) : requestView.loading ? (
              <div className="flex min-h-[220px] items-center justify-center p-7 text-center text-[13px] text-[#6d7777]" role="status">Loading payment requests…</div>
            ) : requestView.items.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 p-7 text-center text-[13px] text-[#6d7777]">
                <strong className="text-[15px] text-[#374343]">No payment requests yet</strong>
                <span>Create a payable to see it here.</span>
                <button className={`${outlineButton} mt-2`} type="button" onClick={openCreate}>Create your first payable</button>
              </div>
            ) : (
              <div className="overflow-x-auto contain-paint">
                <table className="w-full border-collapse text-left text-[13px] max-[720px]:min-w-[800px]">
                  <thead className="bg-[#f7f9f9] text-[#606b6c]"><tr>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 pl-6 text-[11px] font-semibold whitespace-nowrap max-[720px]:pl-3.5">Student / Parent</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-[11px] font-semibold whitespace-nowrap">Payable</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-right text-[11px] font-semibold whitespace-nowrap">Amount</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-[11px] font-semibold whitespace-nowrap">Due date</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-[11px] font-semibold whitespace-nowrap">Status</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-[11px] font-semibold whitespace-nowrap">Payment date</th>
                    <th scope="col" className="h-[42px] border-b border-[#e0e5e5] px-3.5 text-[11px] font-semibold whitespace-nowrap"><span className="sr-only">Details</span></th>
                  </tr></thead>
                  <tbody>
                    {requestView.items.map((item) => (
                      <RequestRows key={item.id} item={item} expanded={expandedId === item.id}
                        onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : (
        <CreatePayable
          students={studentData.items}
          loadingStudents={studentData.loading}
          studentError={studentData.error}
          onBack={() => setPage('list')}
          onCreated={() => { setNotice('Payable created successfully.'); showList() }}
        />
      )}
      <footer className="flex justify-between px-1 pb-[18px] text-[10px] text-[#829091] max-[720px]:text-[9px]"><span>School Payment Request Demo</span><span>Demo payments only</span></footer>
    </main>
  )
}

function RequestRows({ item, expanded, onToggle }: { item: PaymentRequest; expanded: boolean; onToggle: () => void }) {
  const cellClass = 'border-b border-[#e8ecec] px-3.5 py-2.5 align-middle text-[#424a4a] group-last:border-b-0'
  const detailId = `payment-request-${item.id}-details`
  return <>
    <tr className="group min-h-14 hover:bg-[#fbfdfd]">
      <td className={`${cellClass} pl-6 max-[720px]:pl-3.5`}><strong className="block wrap-anywhere text-[13px] font-semibold text-[#303737]">{item.student.name}</strong><small className="mt-[3px] block wrap-anywhere text-[11px] text-[#788283]">{item.parent.name}</small></td>
      <td className={cellClass}><button className="block max-w-[280px] cursor-pointer whitespace-normal wrap-anywhere border-0 bg-transparent p-1 text-left text-[13px] font-semibold text-kindo hover:underline focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>{item.title}</button></td>
      <td className={`${cellClass} text-right whitespace-nowrap tabular-nums`}>{formatNzd(item.amount_cents)}</td>
      <td className={`${cellClass} whitespace-nowrap`}>{item.due_date ? dateLabel(item.due_date) : '—'}</td>
      <td className={cellClass}><span role="status" className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] before:size-[7px] before:rounded-full before:bg-[#b78224] before:content-[""] ${item.status === 'paid' ? 'text-success before:bg-success' : ''}`}>{item.status === 'open' ? 'No payment' : 'Paid'}</span></td>
      <td className={`${cellClass} whitespace-nowrap`}>{dateLabel(item.paid_at)}</td>
      <td className={cellClass}><button className="size-7 cursor-pointer rounded border border-[#d5e0e0] bg-white text-lg leading-none text-[#657273] hover:border-[#8cb8bd] hover:text-kindo focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2" type="button" aria-label={`${expanded ? 'Hide' : 'View'} ${item.title} details`} aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>{expanded ? '−' : '+'}</button></td>
    </tr>
    {expanded && <tr id={detailId}><td className="border-b border-divider bg-[#fbfdfd] px-6 pb-4" colSpan={7}>
      <div className="flex flex-wrap gap-x-9 gap-y-3.5 border-t border-[#e8eeee] pt-3.5">
        <Detail label="Student">{item.student.name}</Detail>
        <Detail label="Parent">{item.parent.name}</Detail>
        <Detail label="Description">{item.description || 'No description'}</Detail>
        <Detail label="Created">{dateLabel(item.created_at)}</Detail>
        {item.payment && <Detail label="Payment reference">{item.payment.provider_reference}</Detail>}
      </div>
    </td></tr>}
  </>
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="max-w-[320px] min-w-[120px]"><span className="mb-1 block text-[10px] tracking-wide text-[#748080] uppercase">{label}</span><strong className="block text-[13px] font-semibold break-words text-[#303737]">{children}</strong></div>
}

function CreatePayable({
  students,
  loadingStudents,
  studentError,
  onBack,
  onCreated,
}: {
  students: Student[]
  loadingStudents: boolean
  studentError: string
  onBack: () => void
  onCreated: () => void
}) {
  const [studentId, setStudentId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return
    const cents = parseNzdToCents(amount)
    const errors: Record<string, string> = {}
    if (!studentId) errors.student = 'Choose a student before creating a payable.'
    if (!title.trim() || title.trim().length > 120) errors.title = 'Enter a title between 1 and 120 characters.'
    if (cents === null) errors.amount = 'Use an amount with up to two decimal places, from NZ$0.01 to NZ$1,000,000.00.'
    if (description.length > 1000) errors.description = 'Description must be 1,000 characters or fewer.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length || cents === null) return

    submittingRef.current = true
    setSubmitting(true)
    try {
      await createPaymentRequest(1, {
        student_id: Number(studentId),
        title: title.trim(),
        description: description.trim() || null,
        amount_cents: cents,
        due_date: dueDate || null,
      })
      onCreated()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Could not create the payable. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return <section className="flex-1 pt-7 pb-12 max-[720px]:pt-[25px]">
    <div className="mb-5 mx-1 flex items-end justify-between gap-6 max-[420px]:flex-col max-[420px]:items-start max-[420px]:gap-3">
      <div>
        <button type="button" className="mb-[7px] inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-[#657272] hover:text-kindo focus-visible:outline-3 focus-visible:outline-kindo/30 focus-visible:outline-offset-2" onClick={onBack}>‹ <span>Payable Status</span></button>
        <h1 className="m-0 text-[28px] leading-[1.2] font-semibold tracking-[-.45px] text-kindo max-[720px]:text-[24px]">Create Payable</h1>
      </div>
      <button className={primaryButton} type="button" disabled={submitting || loadingStudents || Boolean(studentError)} onClick={() => (document.getElementById('create-payable-form') as HTMLFormElement | null)?.requestSubmit()}>
        {submitting ? 'Creating…' : 'Create payable'}
      </button>
    </div>
    <form id="create-payable-form" aria-label="Create payable form" className="overflow-hidden rounded-[20px] border border-[#e4e9e9] bg-white px-6 shadow-[0_3px_14px_#20545a0b] max-[720px]:rounded-[14px] max-[720px]:px-4" onSubmit={(event) => void submit(event)}>
      {(formError || Object.values(fieldErrors).some(Boolean)) && <p role="alert" className="mt-4 border-l-[3px] border-danger bg-[#fff5f4] px-3 py-2.5 text-[12px] text-[#9d1c14]">{formError || Object.values(fieldErrors).filter(Boolean).join(' ')}</p>}
      {studentError && <p role="alert" className="mt-4 border-l-[3px] border-danger bg-[#fff5f4] px-3 py-2.5 text-[12px] text-[#9d1c14]">Could not load students: {studentError}</p>}
      <FormSection title="General" description="Add the payable details">
        <Field label="Title" required error={fieldErrors.title}>
          <input aria-label="Title" aria-required="true" aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'title-error' : undefined} value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); setFieldErrors((current) => ({ ...current, title: '' })); setFormError('') }} placeholder="e.g. School trip" />
        </Field>
        <Field label="Description" error={fieldErrors.description}>
          <textarea aria-label="Description" aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? 'description-error' : undefined} value={description} maxLength={1000} rows={3} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => ({ ...current, description: '' })); setFormError('') }} placeholder="Add more information for the family" />
        </Field>
      </FormSection>
      <FormSection title="Student" description="Choose who this payable is for">
        <Field label="Student" required error={fieldErrors.student}>
          <select aria-label="Student" aria-required="true" aria-invalid={Boolean(fieldErrors.student)} aria-describedby={fieldErrors.student ? 'student-error' : undefined} value={studentId} disabled={loadingStudents || Boolean(studentError)} onChange={(event) => { setStudentId(event.target.value); setFieldErrors((current) => ({ ...current, student: '' })); setFormError('') }}>
            <option value="">{loadingStudents ? 'Loading students…' : 'Select a student'}</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.parent.name} · {student.name}</option>)}
          </select>
        </Field>
      </FormSection>
      <FormSection title="Payment" description="Set the amount and due date">
        <Field label="Amount (NZD)" required error={fieldErrors.amount}>
          <div className="relative">
            <span className="absolute top-2.5 left-2.5 text-[12px] font-normal text-[#768080]">NZ$</span>
            <input className="pl-[42px]!" aria-label="Amount (NZD)" aria-required="true" aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? 'amount-error' : undefined} inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => ({ ...current, amount: '' })); setFormError('') }} placeholder="0.00" />
          </div>
        </Field>
        <Field label="Due date">
          <input aria-label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </FormSection>
      <div className="flex justify-end gap-2.5 py-[19px] pb-[22px]">
        <button className={quietButton} type="button" onClick={onBack} disabled={submitting}>Cancel</button>
        <button className={primaryButton} type="submit" disabled={submitting || loadingStudents || Boolean(studentError)}>
          {submitting ? 'Creating…' : 'Create payable'}
        </button>
      </div>
    </form>
  </section>
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="grid grid-cols-[minmax(150px,22%)_1fr] gap-7 border-b border-divider py-6 last:border-b-0 max-[720px]:grid-cols-1 max-[720px]:gap-3.5 max-[720px]:py-[19px]">
    <div><h2 className="mt-0.5 mb-[5px] text-[15px] font-semibold text-kindo">{title}</h2><p className="max-w-[185px] text-[11px] leading-[1.45] text-[#778181] max-[720px]:max-w-none">{description}</p></div>
    <div className="grid max-w-[720px] gap-[17px]">{children}</div>
  </section>
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-[12px] font-semibold text-[#505b5c]">
    <span>{label}{required && <b aria-hidden="true" className="text-danger"> *</b>}</span>
    <div className="[&_input]:min-h-[38px] [&_input]:w-full [&_input]:rounded-[5px] [&_input]:border [&_input]:border-border [&_input]:bg-white [&_input]:px-2.5 [&_input]:py-2 [&_input]:text-[13px] [&_input]:font-normal [&_input]:text-[#2b3232] [&_input]:focus-visible:outline-3 [&_input]:focus-visible:outline-kindo/30 [&_input]:focus-visible:outline-offset-2 [&_input::placeholder]:text-[#9aa2a2] [&_select]:min-h-[38px] [&_select]:w-full [&_select]:rounded-[5px] [&_select]:border [&_select]:border-border [&_select]:bg-white [&_select]:px-2.5 [&_select]:py-2 [&_select]:text-[13px] [&_select]:font-normal [&_select]:text-[#2b3232] [&_select]:focus-visible:outline-3 [&_select]:focus-visible:outline-kindo/30 [&_select]:focus-visible:outline-offset-2 [&_textarea]:min-h-[82px] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-[5px] [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-white [&_textarea]:px-2.5 [&_textarea]:py-2 [&_textarea]:text-[13px] [&_textarea]:font-normal [&_textarea]:text-[#2b3232] [&_textarea]:focus-visible:outline-3 [&_textarea]:focus-visible:outline-kindo/30 [&_textarea]:focus-visible:outline-offset-2 [&_textarea::placeholder]:text-[#9aa2a2] [&_input:disabled]:cursor-not-allowed [&_input:disabled]:opacity-60 [&_select:disabled]:cursor-not-allowed [&_select:disabled]:opacity-60">
      {children}
    </div>
    {error && <span id={`${label.toLowerCase().split(' ')[0]}-error`} className="text-[11px] font-normal text-danger">{error}</span>}
  </label>
}

function RefreshIcon() {
  return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M16.7 6.8A7 7 0 0 0 4.2 5.2L3 6.5M3 3.4v3.2h3.2M3.3 13.2a7 7 0 0 0 12.5 1.6l1.2-1.3m0 3.1v-3.2h-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default App

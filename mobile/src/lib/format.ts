export function formatMoney(amountCents: number, currency = 'NZD'): string {
  const amount = new Intl.NumberFormat('en-NZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
  return currency === 'NZD' ? `NZ$${amount}` : `${currency} ${amount}`;
}

export function formatAucklandDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Pacific/Auckland',
  }).format(date);
}

// due_date is a calendar date, not a timestamp. Construct it in local time to
// avoid moving the date across a UTC boundary when formatting for Auckland.
export function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Pacific/Auckland',
  }).format(date);
}

export function studentColor(studentId: number): string {
  const colors = ['#8A603A', '#4F7893', '#856289', '#567C62', '#BB744D'];
  return colors[Math.abs(studentId) % colors.length];
}

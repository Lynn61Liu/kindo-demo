import { formatAucklandDateTime, formatDueDate, formatMoney, studentColor } from '../src/lib/format';

describe('parent display formatting', () => {
  it('formats minor currency units without floating display artifacts', () => {
    expect(formatMoney(1250)).toBe('NZ$12.50');
    expect(formatMoney(1)).toBe('NZ$0.01');
    expect(formatMoney(100_000_000)).toBe('NZ$1,000,000.00');
  });

  it('shows UTC timestamps in Auckland time and leaves date-only values on their calendar date', () => {
    expect(formatAucklandDateTime('2026-10-18T01:00:00Z')).toContain('18 Oct 2026');
    expect(formatDueDate('2026-10-20')).toBe('20 Oct 2026');
    expect(formatDueDate('2026-02-30')).toBeNull();
  });

  it('uses a stable student color based on the same student id', () => {
    expect(studentColor(101)).toBe(studentColor(101));
    expect(studentColor(101)).not.toBe(studentColor(102));
  });
});

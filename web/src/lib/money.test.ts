import { describe, expect, it } from 'vitest'
import { formatNzd, parseNzdToCents } from './money'

describe('NZD amount conversion', () => {
  it.each([
    ['12.50', 1250],
    ['0.01', 1],
    ['1000000.00', 100_000_000],
    [' 7 ', 700],
  ])('converts %s to integer cents', (input, expected) => {
    expect(parseNzdToCents(input)).toBe(expected)
  })

  it.each(['', '0', '12.501', '-1', '1e2', 'abc', '1000000.01'])('rejects invalid amount %s', (input) => {
    expect(parseNzdToCents(input)).toBeNull()
  })

  it('formats cents as NZD', () => {
    expect(formatNzd(1250)).toBe('NZ$12.50')
  })
})

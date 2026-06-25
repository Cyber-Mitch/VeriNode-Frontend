import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FIELD_MAX_LENGTHS, safeUrl, sanitizeNodeField, sanitizeText } from '../sanitize'

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<body onload=alert(document.cookie)>',
  '"><script>alert(document.cookie)</script>',
  'javascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  '<a href="javascript:alert(1)">click</a>',
  'onerror=alert(1)',
  'java script:alert(1)',
]

// Interleave malicious payloads with arbitrary (incl. full-Unicode) text.
const maliciousArb = fc
  .array(fc.oneof(fc.constantFrom(...PAYLOADS), fc.string(), fc.fullUnicodeString()), {
    minLength: 1,
    maxLength: 6,
  })
  .map((parts) => parts.join(' '))

describe('sanitizeNodeField — XSS property tests (#9)', () => {
  it('output never contains an executable vector (500 random malicious strings)', () => {
    fc.assert(
      fc.property(maliciousArb, (input) => {
        for (const field of ['displayName', 'description', 'websiteUrl'] as const) {
          const out = sanitizeNodeField(input, field)
          expect(out).not.toMatch(/[<>]/)
          expect(out).not.toMatch(/javascript:/i)
          expect(out).not.toMatch(/vbscript:/i)
          expect(out).not.toMatch(/data:\s*text\/html/i)
          expect(out).not.toMatch(/\bon\w+\s*=/i)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('never exceeds the per-field maximum length', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (input) => {
        expect(sanitizeNodeField(input, 'displayName').length).toBeLessThanOrEqual(
          FIELD_MAX_LENGTHS.displayName,
        )
        expect(sanitizeNodeField(input, 'description').length).toBeLessThanOrEqual(
          FIELD_MAX_LENGTHS.description,
        )
      }),
      { numRuns: 200 },
    )
  })
})

describe('sanitizeText — known vectors and legitimate input', () => {
  it('strips classic XSS vectors to safe text', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('hello')
    expect(sanitizeText('"><script>alert(document.cookie)</script>')).not.toMatch(/[<>]/)
  })

  it('preserves legitimate Unicode (emoji, CJK, RTL) and punctuation', () => {
    expect(sanitizeText('Validator 日本語 🚀 مرحبا')).toBe('Validator 日本語 🚀 مرحبا')
    expect(sanitizeText('Node #1 — A & B (eu-west)')).toBe('Node #1 — A & B (eu-west)')
  })

  it('removes control characters but keeps tab and newline', () => {
    const withControls = `a${String.fromCharCode(0)}b${String.fromCharCode(7)}c${String.fromCharCode(127)}`
    expect(sanitizeText(withControls)).toBe('abc')
    expect(sanitizeText('line1\nline2\tend')).toBe('line1\nline2\tend')
  })
})

describe('safeUrl', () => {
  it('accepts http(s) and rejects dangerous protocols', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com/')
    expect(safeUrl('http://node.io/path')).toBe('http://node.io/path')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
  })
})

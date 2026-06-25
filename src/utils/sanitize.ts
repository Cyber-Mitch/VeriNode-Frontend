// XSS sanitization for operator-configurable node identifier strings.
//
// Node displayName / description / location / contactEmail / websiteUrl are
// arbitrary operator input rendered in every other operator's dashboard, so
// they are prime stored-XSS vectors. Every such value must be passed through
// sanitizeNodeField (or rendered via <SafeText>) before display.
//
// React already escapes text it renders, so the *primary* defense is "never
// use dangerouslySetInnerHTML" (enforced by ESLint). This module is the second
// layer: it reduces input to plain text with no markup, control characters, or
// protocol-based vectors, while preserving legitimate Unicode (emoji, CJK,
// RTL) and common punctuation.

import DOMPurify from 'isomorphic-dompurify'
import type { SanitizableNodeField } from '@/src/types/node'

export const FIELD_MAX_LENGTHS: Record<SanitizableNodeField, number> = {
  displayName: 50,
  description: 500,
  location: 120,
  contactEmail: 254,
  websiteUrl: 2048,
}

// C0 controls except TAB (U+0009) and LF (U+000A), plus DEL and the C1 block
// (U+007F-U+009F). Printable Unicode — letters, numbers, punctuation, symbols,
// emoji, CJK, RTL — is preserved. Built from an ASCII source string so no
// literal control bytes live in this file.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F]', 'g')

// DOMPurify entity-encodes text output (e.g. `&` -> `&amp;`); decode the common
// entities back to plain characters for display.
const BASIC_ENTITIES: Array<[RegExp, string]> = [
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0*39;/g, "'"],
  [/&#x0*27;/gi, "'"],
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'], // last, so a decoded `&` is not re-interpreted
]

function decodeBasicEntities(input: string): string {
  let out = input
  for (const [pattern, replacement] of BASIC_ENTITIES) out = out.replace(pattern, replacement)
  return out
}

// Defense-in-depth: after markup removal, neutralize any residual angle
// brackets and protocol / event-handler tokens so the output can never carry an
// executable vector even if rendered in an unexpected context. Applied to a
// fixpoint because removing one token can splice two halves into a fresh one
// (e.g. "javasjavascript:cript:" -> "javascript:").
function neutralizeVectors(input: string): string {
  let previous: string
  let out = input
  do {
    previous = out
    out = out
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:\s*text\/html/gi, '')
      .replace(/\bon\w+\s*=/gi, '')
  } while (out !== previous)
  return out
}

/**
 * Reduce arbitrary input to safe plain text:
 *   1. strip all HTML tags/attributes via DOMPurify (ALLOWED_TAGS/ATTR: [])
 *   2. decode the basic entities DOMPurify re-encodes
 *   3. normalize to Unicode NFC
 *   4. remove control characters (keeping TAB and LF)
 *   5. neutralize residual XSS vectors
 *   6. collapse to a trimmed string
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  const stripped = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  const decoded = decodeBasicEntities(stripped).normalize('NFC').replace(CONTROL_CHARS, '')
  return neutralizeVectors(decoded).trim()
}

/** Sanitize and enforce the per-field maximum length. */
export function sanitizeNodeField(input: string, field: SanitizableNodeField): string {
  return sanitizeText(input).slice(0, FIELD_MAX_LENGTHS[field])
}

/**
 * Return a safe, displayable URL for `websiteUrl`, or null. Only http(s) URLs
 * survive — `javascript:`, `data:`, and malformed values are rejected, so the
 * result is safe to use as an href.
 */
export function safeUrl(input: string): string | null {
  const cleaned = sanitizeText(input)
  if (cleaned.length === 0) return null
  try {
    const url = new URL(cleaned)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return null
  } catch {
    return null
  }
}

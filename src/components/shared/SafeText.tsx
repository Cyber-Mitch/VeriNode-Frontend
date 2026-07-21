import type { SanitizableNodeField } from '@/src/types/node'
import { sanitizeNodeField, sanitizeText } from '@/src/utils/sanitize'

interface SafeTextProps {
  text: string | null | undefined
  /** Truncate the sanitized output to this many characters (adds an ellipsis). */
  maxLength?: number
  /** Apply per-field sanitization (and its max length) when set. */
  field?: SanitizableNodeField
  className?: string
}

/**
 * Renders untrusted operator text safely: it sanitizes the value (HTML stripped,
 * control chars removed, XSS vectors neutralized) and renders the result as
 * plain text inside a <span>. When truncated, the full sanitized value is
 * exposed via the `title` attribute. Never uses dangerouslySetInnerHTML.
 */
export function SafeText({ text, maxLength, field, className }: SafeTextProps) {
  const clean = field ? sanitizeNodeField(text ?? '', field) : sanitizeText(text ?? '')

  const isTruncated = typeof maxLength === 'number' && clean.length > maxLength
  const display = isTruncated ? `${clean.slice(0, maxLength).trimEnd()}…` : clean

  return (
    <span className={className} title={isTruncated ? clean : undefined}>
      {display}
    </span>
  )
}

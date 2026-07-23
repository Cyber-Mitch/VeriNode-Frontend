/**
 * `useTracing` — React hook for distributed tracing (#104)
 *
 * Provides a stable `Tracer` reference tied to the calling component's
 * instrumentation library name.  All spans created through this hook are
 * automatically linked via the global `TracerProvider`.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const tracer = useTracing('my-component')
 *
 *   async function handleClick() {
 *     await tracer.withSpanAsync('button.click', { kind: 'INTERNAL' }, async (span) => {
 *       span.setAttribute('ui.element', 'submit-button')
 *       await submitForm()
 *     })
 *   }
 * }
 * ```
 */

'use client'

import { useState } from 'react'
import { getGlobalTracer } from '@/src/services/tracing'
import type { Tracer } from '@/src/services/tracing'

/**
 * Returns a stable `Tracer` instance for the given instrumentation library
 * name.  The reference is memoised per component mount — it never changes
 * across re-renders, which makes it safe to include in dependency arrays.
 *
 * @param library  Instrumentation library name shown in span metadata.
 *                 Defaults to `"verinode-frontend"`.
 */
export function useTracing(library = 'verinode-frontend'): Tracer {
  // useState with an initialiser function runs exactly once per mount.
  // Unlike useRef, reading `value` during render is explicitly allowed.
  const [tracer] = useState<Tracer>(() => getGlobalTracer(library))
  return tracer
}

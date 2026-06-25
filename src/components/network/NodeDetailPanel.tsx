import type { ReactNode } from 'react'
import { SafeText } from '@/src/components/shared/SafeText'
import { safeUrl } from '@/src/utils/sanitize'
import type { NetworkNode } from '@/src/types/node'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-3 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200">{children}</dd>
    </div>
  )
}

/**
 * Full node detail view. As with NodeCard, every operator-supplied field is
 * rendered through <SafeText>; the website is linked only when it is a safe
 * http(s) URL.
 */
export function NodeDetailPanel({ node }: { node: NetworkNode }) {
  const website = node.websiteUrl ? safeUrl(node.websiteUrl) : null

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <h2 className="text-xl font-semibold" data-testid="detail-display-name">
        <SafeText text={node.displayName} field="displayName" />
      </h2>

      <dl className="mt-4">
        <Row label="Description">
          <SafeText text={node.description} field="description" />
        </Row>
        <Row label="Location">
          <SafeText text={node.location} field="location" />
        </Row>
        {node.contactEmail && (
          <Row label="Contact">
            <SafeText text={node.contactEmail} field="contactEmail" />
          </Row>
        )}
        <Row label="Website">
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sky-400 hover:underline"
            >
              {website}
            </a>
          ) : node.websiteUrl ? (
            <SafeText text={node.websiteUrl} field="websiteUrl" />
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </Row>
      </dl>
    </section>
  )
}

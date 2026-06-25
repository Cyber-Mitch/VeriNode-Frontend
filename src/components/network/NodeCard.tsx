import { SafeText } from '@/src/components/shared/SafeText'
import { safeUrl } from '@/src/utils/sanitize'
import type { NetworkNode } from '@/src/types/node'

/**
 * Compact node card. Every operator-supplied string is rendered through
 * <SafeText> (sanitized plain text); the website is rendered as a link only if
 * it resolves to a safe http(s) URL.
 */
export function NodeCard({ node }: { node: NetworkNode }) {
  const website = node.websiteUrl ? safeUrl(node.websiteUrl) : null

  return (
    <article
      className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-white"
      data-testid={`node-card-${node.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold" data-testid="node-display-name">
          <SafeText text={node.displayName} field="displayName" maxLength={50} />
        </h3>
        {node.location && (
          <span className="shrink-0 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300">
            <SafeText text={node.location} field="location" maxLength={32} />
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-400" data-testid="node-description">
        <SafeText text={node.description} field="description" maxLength={160} />
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {node.contactEmail && (
          <span data-testid="node-contact-email">
            <SafeText text={node.contactEmail} field="contactEmail" maxLength={40} />
          </span>
        )}
        {website ? (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-sky-400 hover:underline"
            data-testid="node-website-link"
          >
            {website}
          </a>
        ) : node.websiteUrl ? (
          <SafeText text={node.websiteUrl} field="websiteUrl" maxLength={40} />
        ) : null}
      </div>
    </article>
  )
}

// Operator-configurable node fields. All string fields are untrusted input and
// MUST be passed through sanitizeNodeField / <SafeText> before rendering.

export interface NetworkNode {
  id: string
  displayName: string
  description: string
  location: string
  contactEmail?: string
  websiteUrl?: string
}

export type SanitizableNodeField =
  | 'displayName'
  | 'description'
  | 'location'
  | 'contactEmail'
  | 'websiteUrl'

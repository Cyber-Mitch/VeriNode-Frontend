export type ClipboardExpectedFormat = 'hex' | 'bech32' | 'base64' | 'mnemonic'

export class InvalidClipboardContent extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidClipboardContent'
  }
}

const unicodeControlPattern = /[\u200B-\u200F\u2028-\u2029\uFEFF]/g
const hexPattern = /^0x[0-9a-fA-F]+$/
const bech32Pattern = /^(st|stx)[023456789acdefghjklmnpqrstuvwxyz]+$/i
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const mnemonicWordPattern = /^[a-z]+(?:\s+[a-z]+)*$/i

export interface SanitizedClipboardContent {
  sanitized: string
  warnings: string[]
}

export function stripUnicodeControl(value: string): string {
  return value.replace(unicodeControlPattern, '')
}

function validateHex(value: string): void {
  if (!value.startsWith('0x')) {
    throw new InvalidClipboardContent('Clipboard content must be 0x-prefixed hex.')
  }

  if (value.length <= 2 || (value.length - 2) % 2 !== 0) {
    throw new InvalidClipboardContent('Clipboard hex content must contain an even number of hex characters.')
  }

  if (!hexPattern.test(value)) {
    throw new InvalidClipboardContent('Clipboard hex content contains non-hex characters.')
  }
}

function validateBech32(value: string): void {
  if (!bech32Pattern.test(value)) {
    throw new InvalidClipboardContent('Clipboard content must be a bech32 value starting with st or stx.')
  }
}

function validateBase64(value: string): void {
  if (value.length === 0 || value.length % 4 !== 0 || !base64Pattern.test(value)) {
    throw new InvalidClipboardContent('Clipboard content must be valid base64 with correct padding.')
  }
}

function validateMnemonic(value: string): void {
  const normalized = value.replace(/\s+/g, ' ')
  const wordCount = normalized.length === 0 ? 0 : normalized.split(' ').length

  if (!mnemonicWordPattern.test(normalized) || ![12, 15, 18, 21, 24].includes(wordCount)) {
    throw new InvalidClipboardContent('Clipboard mnemonic must contain 12, 15, 18, 21, or 24 words.')
  }
}

export function validateFormat(value: string, expectedFormat: ClipboardExpectedFormat): void {
  switch (expectedFormat) {
    case 'hex':
      validateHex(value)
      return
    case 'bech32':
      validateBech32(value)
      return
    case 'base64':
      validateBase64(value)
      return
    case 'mnemonic':
      validateMnemonic(value)
      return
    default: {
      const exhaustive: never = expectedFormat
      throw new InvalidClipboardContent(`Unsupported clipboard format: ${exhaustive}`)
    }
  }
}

export function sanitize(raw: string, expectedFormat: ClipboardExpectedFormat): SanitizedClipboardContent {
  const warnings: string[] = []
  const trimmed = raw.trim()

  if (trimmed !== raw) {
    warnings.push('Removed leading or trailing whitespace.')
  }

  let sanitized = stripUnicodeControl(trimmed)

  if (sanitized !== trimmed) {
    warnings.push('Removed invisible Unicode control characters.')
  }

  if (expectedFormat === 'mnemonic') {
    const normalized = sanitized.replace(/\s+/g, ' ')
    if (normalized !== sanitized) {
      warnings.push('Collapsed mnemonic whitespace.')
      sanitized = normalized
    }
  }

  validateFormat(sanitized, expectedFormat)

  return { sanitized, warnings }
}

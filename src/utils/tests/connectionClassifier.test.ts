import { describe, expect, it } from 'vitest'
import { classifyWebSocketCloseCode } from '@/src/utils/connectionClassifier'

describe('connectionClassifier', () => {
  it('classifies 1000 as Tier 1', () => {
    const result = classifyWebSocketCloseCode(1000, 'normal')
    expect(result.tier).toBe(1)
    expect(result.label).toBe('normal')
  })

  it('classifies 1006 / 1015 as Tier 2', () => {
    const a = classifyWebSocketCloseCode(1006)
    expect(a.tier).toBe(2)
    expect(a.label).toBe('abnormal')

    const b = classifyWebSocketCloseCode(1015)
    expect(b.tier).toBe(2)
    expect(b.label).toBe('abnormal')
  })

  it('classifies 4000–4009 as Tier 3 auth error', () => {
    const result = classifyWebSocketCloseCode(4001, 'no credentials')
    expect(result.tier).toBe(3)
    expect(result.label).toBe('auth-error')
  })

  it('classifies 3000–3009 as Tier 3 version mismatch', () => {
    const result = classifyWebSocketCloseCode(3009, 'unsupported version')
    expect(result.tier).toBe(3)
    expect(result.label).toBe('version-mismatch')
  })

  it('defaults unknown close codes to Tier 2', () => {
    const result = classifyWebSocketCloseCode(9999)
    expect(result.tier).toBe(2)
    expect(result.label).toBe('abnormal')
  })
})


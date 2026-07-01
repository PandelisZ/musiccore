import { describe, expect, it } from 'vitest'
import { createSongSchema } from './schema'
import { testPattern, testSongInput } from './test-helpers'

describe('public song schema', () => {
  it('accepts the canonical composition contract', () => {
    expect(createSongSchema.safeParse(testSongInput()).success).toBe(true)
  })

  it('rejects the legacy flat browser payload', () => {
    const legacy = {
      title: 'Legacy loop', pattern: testPattern(), bpm: 128,
      timeSignature: { numerator: 4, denominator: 4 }, bars: 1,
      key: 'A', scale: 'minor', arrangement: [],
    }
    expect(createSongSchema.safeParse(legacy).success).toBe(false)
  })
})

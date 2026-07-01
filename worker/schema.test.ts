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

  it('caps the expanded arrangement at 256 bars', () => {
    const allowed = testSongInput()
    allowed.arrangement = [
      { id: 'a', name: 'A', clipId: 'main', bars: 64, repeats: 4 },
    ]
    expect(createSongSchema.safeParse(allowed).success).toBe(true)

    const oversized = testSongInput()
    oversized.arrangement = [
      { id: 'a', name: 'A', clipId: 'main', bars: 64, repeats: 4 },
      { id: 'b', name: 'B', clipId: 'drop', bars: 1, repeats: 1 },
    ]
    const result = createSongSchema.safeParse(oversized)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map(({ message }) => message)).toContain('Arrangement may expand to at most 256 bars')
  })
})

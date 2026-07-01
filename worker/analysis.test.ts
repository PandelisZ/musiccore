import { describe, expect, it } from 'vitest'
import { analyzeSong } from './analysis'
import { testSongInput } from './test-helpers'

describe('analyzeSong', () => {
  it('analyzes the full arrangement with deterministic musical feedback', () => {
    const analysis = analyzeSong(testSongInput())

    expect(analysis.totalBars).toBe(10)
    expect(analysis.onsetGrid).toHaveLength(10)
    expect(analysis.trackDensity.drums).toBeGreaterThan(0)
    expect(analysis.pitchRange.melody).toMatchObject({ min: expect.any(Number), max: expect.any(Number) })
    expect(analysis.pitchContour.melody.length).toBeGreaterThan(16)
    expect(analysis.syncopation).toBeGreaterThanOrEqual(0)
    expect(analysis.repetition).toBeGreaterThan(0)
    expect(analysis.energyByBar).toHaveLength(10)
    expect(analysis.asciiWaveform.split('\n')).toHaveLength(3)
  })
})

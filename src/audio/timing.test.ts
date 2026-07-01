import { describe, expect, it } from 'vitest'

import { stepDurationSeconds, stepOffsetSeconds } from './timing'

describe('sequencer timing', () => {
  it('converts BPM to a sixteenth-note duration', () => {
    expect(stepDurationSeconds(120)).toBe(0.125)
    expect(() => stepDurationSeconds(0)).toThrow('BPM')
  })

  it('delays odd sixteenth notes while preserving each two-step pair', () => {
    expect(stepOffsetSeconds(0, 120, 0.5)).toBe(0)
    expect(stepOffsetSeconds(1, 120, 0.5)).toBeCloseTo(0.1875)
    expect(stepOffsetSeconds(2, 120, 0.5)).toBe(0.25)
    expect(stepOffsetSeconds(3, 120, 0.5)).toBeCloseTo(0.4375)
  })

  it('rejects invalid step and swing values', () => {
    expect(() => stepOffsetSeconds(-1, 120, 0)).toThrow('Step')
    expect(() => stepOffsetSeconds(1, 120, 1.1)).toThrow('Swing')
  })
})

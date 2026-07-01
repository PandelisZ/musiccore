import { describe, expect, it } from 'vitest'

import {
  clearPattern,
  createEmptyPattern,
  toggleStep,
  validatePattern,
} from './pattern'

describe('pattern', () => {
  it('creates three tracks with sixteen silent steps', () => {
    const pattern = createEmptyPattern()

    expect(pattern.tracks.map((track) => track.steps.length)).toEqual([16, 16, 16])
    expect(pattern.tracks.flatMap((track) => track.steps).every((step) => !step.active)).toBe(true)
  })

  it('toggles one step without mutating the input', () => {
    const original = createEmptyPattern()

    const next = toggleStep(original, 'drums', 0)

    expect(next.tracks[0].steps[0].active).toBe(true)
    expect(original.tracks[0].steps[0].active).toBe(false)
  })

  it('clears active steps without mutating the input', () => {
    const original = toggleStep(createEmptyPattern(), 'bass', 4)

    const next = clearPattern(original)

    expect(next.tracks.flatMap((track) => track.steps).every((step) => !step.active)).toBe(true)
    expect(original.tracks[1].steps[4].active).toBe(true)
  })

  it('rejects patterns without exactly sixteen steps per track', () => {
    const invalid = structuredClone(createEmptyPattern())
    invalid.tracks[0].steps.pop()

    expect(validatePattern(invalid)).toBe(false)
  })

  it('rejects duplicate or structurally invalid tracks and steps', () => {
    const duplicate = structuredClone(createEmptyPattern())
    duplicate.tracks[1].id = 'drums'
    const invalidStep = structuredClone(createEmptyPattern()) as unknown as {
      tracks: Array<{ steps: Array<{ active: unknown }> }>
    }
    invalidStep.tracks[0].steps[0].active = 'yes'

    expect(validatePattern(duplicate)).toBe(false)
    expect(validatePattern(invalidStep)).toBe(false)
    expect(validatePattern(null)).toBe(false)
  })
})

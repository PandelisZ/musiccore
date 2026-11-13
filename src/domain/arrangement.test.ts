import { describe, expect, it } from 'vitest'
import { createEmptyPattern, type Pattern } from './pattern'
import { createArrangementTimeline } from './arrangement'

function clip(note: number): Pattern {
  const pattern = createEmptyPattern()
  pattern.tracks[1].steps[0] = { active: true, velocity: 1, note }
  return pattern
}

describe('arrangement timeline', () => {
  const timeline = createArrangementTimeline(
    [{ id: 'intro', name: 'Intro', pattern: clip(36) }, { id: 'verse', name: 'Verse', pattern: clip(40) }],
    [
      { id: 'a', name: 'Intro', clipId: 'intro', bars: 1, repeats: 1 },
      { id: 'b', name: 'Verse', clipId: 'verse', bars: 2, repeats: 2 },
    ],
  )

  it('moves from intro into the repeated verse without truncating absolute steps', () => {
    expect(timeline.totalBars).toBe(5)
    expect(timeline.totalSteps).toBe(80)
    expect(timeline.atStep(15)).toMatchObject({ clipId: 'intro', visibleStep: 15, sectionBar: 0, repeat: 0 })
    expect(timeline.atStep(16)).toMatchObject({ clipId: 'verse', visibleStep: 0, sectionBar: 0, repeat: 0 })
    expect(timeline.atStep(48)).toMatchObject({ clipId: 'verse', visibleStep: 0, sectionBar: 0, repeat: 1 })
  })

  it('resolves seeks and wraps only at the configured bar loop', () => {
    const loop = timeline.loopSteps({ startBar: 1, endBar: 4 })
    expect(loop).toEqual({ startStep: 16, endStep: 64 })
    expect(timeline.atStep(63)).toMatchObject({ clipId: 'verse', visibleStep: 15, repeat: 1 })
  })
})

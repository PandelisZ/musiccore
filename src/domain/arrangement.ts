import { STEPS_PER_TRACK, type Pattern } from './pattern'

export interface ArrangementClip { id: string; name: string; pattern: Pattern }
export interface ArrangementSection { id: string; name: string; clipId: string; bars: number; repeats: number }
export interface ArrangementLoop { startBar: number; endBar: number }

export interface ArrangementPosition {
  absoluteStep: number
  absoluteBar: number
  visibleStep: number
  clipId: string
  pattern: Pattern
  section: ArrangementSection
  sectionIndex: number
  sectionBar: number
  repeat: number
}

export interface ArrangementTimeline {
  totalBars: number
  totalSteps: number
  atStep(step: number): ArrangementPosition
  loopSteps(loop: ArrangementLoop): { startStep: number; endStep: number }
}

export function createArrangementTimeline(clips: ArrangementClip[], sections: ArrangementSection[]): ArrangementTimeline {
  const clipById = new Map(clips.map((clip) => [clip.id, clip]))
  const spans = sections.map((section, sectionIndex) => {
    const clip = clipById.get(section.clipId)
    if (!clip) throw new TypeError(`Arrangement section references unknown clip ${section.clipId}`)
    if (!Number.isInteger(section.bars) || section.bars < 1 || !Number.isInteger(section.repeats) || section.repeats < 1) {
      throw new TypeError('Arrangement bars and repeats must be positive integers')
    }
    return { section, sectionIndex, clip, bars: section.bars * section.repeats }
  })
  const totalBars = spans.reduce((sum, span) => sum + span.bars, 0)
  if (totalBars < 1) throw new TypeError('Arrangement must contain at least one section')

  return {
    totalBars,
    totalSteps: totalBars * STEPS_PER_TRACK,
    atStep(step) {
      if (!Number.isInteger(step) || step < 0 || step >= totalBars * STEPS_PER_TRACK) {
        throw new RangeError(`Arrangement step must be between 0 and ${totalBars * STEPS_PER_TRACK - 1}`)
      }
      const absoluteBar = Math.floor(step / STEPS_PER_TRACK)
      let firstBar = 0
      for (const span of spans) {
        if (absoluteBar < firstBar + span.bars) {
          const barWithinSpan = absoluteBar - firstBar
          return {
            absoluteStep: step,
            absoluteBar,
            visibleStep: step % STEPS_PER_TRACK,
            clipId: span.clip.id,
            pattern: span.clip.pattern,
            section: span.section,
            sectionIndex: span.sectionIndex,
            sectionBar: barWithinSpan % span.section.bars,
            repeat: Math.floor(barWithinSpan / span.section.bars),
          }
        }
        firstBar += span.bars
      }
      throw new RangeError('Arrangement position could not be resolved')
    },
    loopSteps(loop) {
      if (!Number.isInteger(loop.startBar) || !Number.isInteger(loop.endBar) || loop.startBar < 0 || loop.startBar >= loop.endBar || loop.endBar > totalBars) {
        throw new RangeError(`Loop bars must be within 0..${totalBars} and non-empty`)
      }
      return { startStep: loop.startBar * STEPS_PER_TRACK, endStep: loop.endBar * STEPS_PER_TRACK }
    },
  }
}

import type { CreateSongInput, PatternInput } from './schema'

type TrackId = 'drums' | 'bass' | 'melody'

export interface SongAnalysis {
  totalBars: number
  onsetGrid: string[]
  trackDensity: Record<TrackId, number>
  pitchRange: Record<TrackId, { min: number; max: number } | null>
  pitchContour: Record<TrackId, number[]>
  syncopation: number
  repetition: number
  energyByBar: number[]
  asciiWaveform: string
  summary: string
}

function arrangedBars(song: CreateSongInput): PatternInput[] {
  if (song.arrangement.length === 0) return [song.pattern]
  const clips = new Map(song.clips.map((clip) => [clip.id, clip.pattern]))
  return song.arrangement.flatMap((section) =>
    Array.from({ length: section.bars * section.repeats }, () => clips.get(section.clipId) ?? song.pattern),
  )
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function analyzeSong(song: CreateSongInput): SongAnalysis {
  const bars = arrangedBars(song)
  const ids: TrackId[] = ['drums', 'bass', 'melody']
  const density = {} as Record<TrackId, number>
  const pitchRange = {} as SongAnalysis['pitchRange']
  const contour = {} as SongAnalysis['pitchContour']
  let active = 0
  let syncopated = 0

  for (const id of ids) {
    const steps = bars.flatMap((bar) => bar.tracks.find((track) => track.id === id)?.steps ?? [])
    const activeSteps = steps.filter((step) => step.active)
    const pitches = activeSteps.flatMap((step) => step.note === undefined ? [] : [step.note])
    density[id] = rounded(activeSteps.length / Math.max(1, steps.length))
    pitchRange[id] = pitches.length ? { min: Math.min(...pitches), max: Math.max(...pitches) } : null
    contour[id] = pitches
    active += activeSteps.length
    syncopated += steps.filter((step, index) => step.active && index % 4 !== 0).length
  }

  const onsetGrid = bars.map((bar) =>
    Array.from({ length: 16 }, (_, index) => bar.tracks.some((track) => track.steps[index]?.active) ? 'x' : '.').join(''),
  )
  const uniqueBars = new Set(onsetGrid).size
  const energyByBar = bars.map((bar) => rounded(
    bar.tracks.flatMap((track) => track.steps).reduce((sum, step) => sum + (step.active ? step.velocity : 0), 0) / 48,
  ))
  const levels = ' .:-=+*#%@'
  const asciiWaveform = ids.map((id) => {
    const line = bars.map((bar) => {
      const steps = bar.tracks.find((track) => track.id === id)?.steps ?? []
      const energy = steps.reduce((sum, step) => sum + (step.active ? step.velocity : 0), 0) / Math.max(1, steps.length)
      return levels[Math.min(levels.length - 1, Math.round(energy * (levels.length - 1)))]
    }).join('')
    return `${id.padEnd(6)} |${line}|`
  }).join('\n')
  const result: SongAnalysis = {
    totalBars: bars.length,
    onsetGrid,
    trackDensity: density,
    pitchRange,
    pitchContour: contour,
    syncopation: rounded(syncopated / Math.max(1, active)),
    repetition: rounded(1 - uniqueBars / Math.max(1, bars.length)),
    energyByBar,
    asciiWaveform,
    summary: '',
  }
  result.summary = `${result.totalBars} bars; ${Math.round(result.syncopation * 100)}% off-beat onsets; ${Math.round(result.repetition * 100)}% repetition.`
  return result
}

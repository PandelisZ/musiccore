import {
  STEPS_PER_TRACK,
  type Pattern,
  type Step,
  type Track,
  type TrackId,
} from './pattern'

export const MUSICAL_KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export const MUSICAL_SCALES = ['major', 'minor', 'dorian', 'mixolydian', 'pentatonic'] as const

export type MusicalKey = (typeof MUSICAL_KEYS)[number]
export type MusicalScale = (typeof MUSICAL_SCALES)[number]

export interface GeneratorSettings {
  seed: string | number
  key: MusicalKey
  scale: MusicalScale
  density: number
  mutation: number
}

/** Provider seam for deterministic, MCP-backed, or remote AI generators. */
export interface PatternGenerator {
  generate(settings: GeneratorSettings): Promise<Pattern>
}

const SCALE_INTERVALS: Record<MusicalScale, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
}

function validateSettings(settings: GeneratorSettings): void {
  const validSeed =
    (typeof settings.seed === 'string' && settings.seed.length > 0) ||
    (typeof settings.seed === 'number' && Number.isFinite(settings.seed))
  if (!validSeed) {
    throw new RangeError('seed must be a non-empty string or number')
  }
  if (!(MUSICAL_KEYS as readonly string[]).includes(settings.key)) {
    throw new RangeError('key must be a supported musical key')
  }
  if (!(MUSICAL_SCALES as readonly string[]).includes(settings.scale)) {
    throw new RangeError('scale must be supported')
  }
  for (const field of ['density', 'mutation'] as const) {
    if (!Number.isFinite(settings[field]) || settings[field] < 0 || settings[field] > 1) {
      throw new RangeError(`${field} must be between 0 and 1`)
    }
  }
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Small seeded PRNG with stable 32-bit arithmetic across JS runtimes. */
export function createSeededRandom(seed: string | number): () => number {
  let state = hashSeed(String(seed))
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function noteFromScale(root: number, intervals: readonly number[], degree: number): number {
  const wrappedDegree = ((degree % intervals.length) + intervals.length) % intervals.length
  const octave = Math.floor(degree / intervals.length)
  return root + intervals[wrappedDegree] + octave * 12
}

function makeTrack(id: TrackId, steps: Step[]): Track {
  return { id, steps }
}

export class DeterministicPatternGenerator implements PatternGenerator {
  async generate(settings: GeneratorSettings): Promise<Pattern> {
    validateSettings(settings)

    const random = createSeededRandom(settings.seed)
    const root = 36 + MUSICAL_KEYS.indexOf(settings.key)
    const intervals = SCALE_INTERVALS[settings.scale]
    const samples = Array.from({ length: 48 }, () => ({
      gate: random(),
      velocity: random(),
      choice: random(),
      mutation: random(),
    }))

    const drums = Array.from({ length: STEPS_PER_TRACK }, (_, index): Step => {
      const sample = samples[index]
      const strongBeat = index % 4 === 0
      const active = index === 0 || sample.gate < settings.density * (strongBeat ? 1.15 : 0.72)
      const note = index === 0 || index % 8 === 0 ? 36 : index % 4 === 2 ? 38 : 42
      return { active, velocity: index === 0 ? 1 : 0.55 + sample.velocity * 0.4, note }
    })

    const bass = Array.from({ length: STEPS_PER_TRACK }, (_, index): Step => {
      const sample = samples[16 + index]
      const beatWeight = index % 4 === 0 ? 1 : 0.58
      const active = index === 0 || sample.gate < settings.density * beatWeight
      const baseDegree = Math.floor(sample.choice * Math.min(intervals.length, 5))
      const degree = sample.mutation < settings.mutation ? baseDegree + 1 : baseDegree
      return {
        active,
        velocity: index === 0 ? 0.95 : 0.58 + sample.velocity * 0.32,
        note: index === 0 ? root : noteFromScale(root, intervals, degree),
      }
    })

    const melody = Array.from({ length: STEPS_PER_TRACK }, (_, index): Step => {
      const sample = samples[32 + index]
      const active = sample.gate < settings.density * 0.78
      const baseDegree = Math.floor(sample.choice * intervals.length) + (index % 4 === 0 ? 2 : 0)
      const mutationLeap = sample.mutation < settings.mutation ? intervals.length : 0
      return {
        active,
        velocity: 0.48 + sample.velocity * 0.4,
        note: noteFromScale(root + 24, intervals, baseDegree + mutationLeap),
      }
    })

    return {
      tracks: [makeTrack('drums', drums), makeTrack('bass', bass), makeTrack('melody', melody)],
    }
  }
}

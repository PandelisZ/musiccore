export const TRACK_IDS = ['drums', 'bass', 'melody'] as const
export const STEPS_PER_TRACK = 16

export type TrackId = (typeof TRACK_IDS)[number]

export interface Step {
  active: boolean
  velocity: number
  note?: number
}

export interface Track {
  id: TrackId
  steps: Step[]
}

export interface Pattern {
  tracks: Track[]
}

const createSilentStep = (): Step => ({ active: false, velocity: 1 })

export function createEmptyPattern(): Pattern {
  return {
    tracks: TRACK_IDS.map((id) => ({
      id,
      steps: Array.from({ length: STEPS_PER_TRACK }, createSilentStep),
    })),
  }
}

export function toggleStep(pattern: Pattern, trackId: TrackId, stepIndex: number): Pattern {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= STEPS_PER_TRACK) {
    throw new RangeError(`Step index must be between 0 and ${STEPS_PER_TRACK - 1}`)
  }

  return {
    ...pattern,
    tracks: pattern.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            steps: track.steps.map((step, index) =>
              index === stepIndex ? { ...step, active: !step.active } : step,
            ),
          }
        : track,
    ),
  }
}

export function clearPattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: track.steps.map((step) => ({ ...step, active: false })),
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTrackId(value: unknown): value is TrackId {
  return typeof value === 'string' && (TRACK_IDS as readonly string[]).includes(value)
}

function isStep(value: unknown, trackId: TrackId): value is Step {
  if (!isRecord(value)) return false

  const hasValidNote =
    value.note === undefined ||
    (typeof value.note === 'number' &&
      Number.isInteger(value.note) &&
      value.note >= 0 &&
      value.note <= 127)

  return (
    typeof value.active === 'boolean' &&
    typeof value.velocity === 'number' &&
    Number.isFinite(value.velocity) &&
    value.velocity >= 0 &&
    value.velocity <= 1 &&
    hasValidNote &&
    (!value.active || trackId === 'drums' || value.note !== undefined)
  )
}

export function validatePattern(value: unknown): value is Pattern {
  if (!isRecord(value) || !Array.isArray(value.tracks) || value.tracks.length !== TRACK_IDS.length) {
    return false
  }

  const trackIds = new Set<TrackId>()
  for (const track of value.tracks) {
    if (!isRecord(track) || !isTrackId(track.id) || trackIds.has(track.id)) return false
    const trackId = track.id
    if (
      !Array.isArray(track.steps) ||
      track.steps.length !== STEPS_PER_TRACK ||
      !track.steps.every((step) => isStep(step, trackId))
    ) {
      return false
    }
    trackIds.add(trackId)
  }

  return TRACK_IDS.every((trackId) => trackIds.has(trackId))
}

import { z } from 'zod'

const stepSchema = z
  .object({
    active: z.boolean(),
    velocity: z.number().finite().min(0).max(1),
    note: z.number().int().min(0).max(127).optional(),
  })
  .strict()

const trackIdSchema = z.enum(['drums', 'bass', 'melody'])

const trackSchema = z
  .object({
    id: trackIdSchema,
    steps: z.array(stepSchema).length(16),
  })
  .strict()

export const patternSchema = z
  .object({ tracks: z.array(trackSchema).length(3) })
  .strict()
  .superRefine(({ tracks }, context) => {
    if (new Set(tracks.map(({ id }) => id)).size !== 3) {
      context.addIssue({ code: 'custom', message: 'Pattern must contain each track exactly once' })
    }
  })

export const musicalKeySchema = z.enum([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
])
export const musicalScaleSchema = z.enum(['major', 'minor', 'dorian', 'mixolydian', 'pentatonic'])

export const timeSignatureSchema = z
  .object({ numerator: z.number().int().min(1).max(12), denominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]) })
  .strict()

export const songSettingsSchema = z
  .object({
    bpm: z.number().int().min(30).max(300),
    timeSignature: timeSignatureSchema,
    subdivision: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
    loop: z.object({ startBar: z.number().int().min(0).max(255), endBar: z.number().int().min(1).max(256) }).strict(),
    key: musicalKeySchema,
    scale: musicalScaleSchema,
    swing: z.number().finite().min(0).max(0.75),
  })
  .strict()
  .refine(({ loop }) => loop.endBar > loop.startBar, 'Loop end must be after loop start')

const idSchema = z.string().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/)

export const clipSchema = z.object({ id: idSchema, name: z.string().min(1).max(64), pattern: patternSchema }).strict()

export const sectionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(64),
  clipId: idSchema,
  bars: z.number().int().min(1).max(64),
  repeats: z.number().int().min(1).max(16),
}).strict()

const compositionFields = {
  title: z.string().trim().min(1).max(128),
  pattern: patternSchema,
  settings: songSettingsSchema,
  clips: z.array(clipSchema).max(32),
  arrangement: z.array(sectionSchema).max(32).default([]),
}

function validateComposition(value: { clips: Array<{ id: string }>; arrangement: Array<{ id: string; clipId: string }> }, context: z.RefinementCtx) {
  const clipIds = new Set(value.clips.map(({ id }) => id))
  if (clipIds.size !== value.clips.length) context.addIssue({ code: 'custom', message: 'Clip IDs must be unique' })
  if (new Set(value.arrangement.map(({ id }) => id)).size !== value.arrangement.length) context.addIssue({ code: 'custom', message: 'Section IDs must be unique' })
  for (const section of value.arrangement) {
    if (!clipIds.has(section.clipId)) context.addIssue({ code: 'custom', message: `Unknown clip: ${section.clipId}` })
  }
}

export const createSongSchema = z.object(compositionFields).strict().superRefine(validateComposition)
export const updateSongSchema = z.object({ expectedRevision: z.number().int().min(1), ...compositionFields }).strict().superRefine(validateComposition)

export const slugSchema = z.string().min(20).max(64).regex(/^[a-z0-9_-]+$/)

export const controlEventSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('play'), atStep: z.number().int().min(0).max(1023).default(0) }).strict(),
  z.object({ command: z.literal('stop') }).strict(),
  z.object({ command: z.literal('seek'), atStep: z.number().int().min(0).max(1023) }).strict(),
  z.object({ command: z.literal('tempo'), bpm: z.number().int().min(30).max(300) }).strict(),
])

export type PatternInput = z.infer<typeof patternSchema>
export type CreateSongInput = z.infer<typeof createSongSchema>
export type UpdateSongInput = z.infer<typeof updateSongSchema>
export type ControlEvent = z.infer<typeof controlEventSchema>

export interface SongSnapshot extends CreateSongInput {
  slug: string
  revision: number
  createdAt: string
  updatedAt: string
  publicUrl: string
}

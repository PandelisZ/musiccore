import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler } from 'agents/mcp'
import { z } from 'zod'
import { analyzeSong } from './analysis'
import type { Env } from './SongRoom'
import {
  controlEventSchema,
  createSongSchema,
  slugSchema,
  updateSongSchema,
  type SongSnapshot,
} from './schema'

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

function secureSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '').toLowerCase()
}

async function roomFetch(env: Env, origin: string, slug: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('x-public-origin', origin)
  return env.SONGS.getByName(slug).fetch(new Request(`${origin}${path}`, { ...init, headers }))
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json<Record<string, unknown>>()
  if (!response.ok) throw new Error(JSON.stringify(body))
  return body
}

function result(value: unknown) {
  const text = JSON.stringify(value)
  return { content: [{ type: 'text' as const, text }] }
}

const mutationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('set_step'), track: z.enum(['drums', 'bass', 'melody']), step: z.number().int().min(0).max(15), active: z.boolean(), velocity: z.number().min(0).max(1), note: z.number().int().min(0).max(127).optional() }).strict(),
  z.object({ operation: z.literal('set_tempo'), bpm: z.number().int().min(30).max(300) }).strict(),
  z.object({ operation: z.literal('set_swing'), swing: z.number().min(0).max(0.75) }).strict(),
  z.object({ operation: z.literal('transpose'), semitones: z.number().int().min(-24).max(24) }).strict(),
])

function createServer(env: Env, origin: string): McpServer {
  const server = new McpServer(
    { name: 'musiccore', version: '1.0.0' },
    { instructions: 'Compose public songs with create_song, make bounded revision-safe edits with update_song or mutate_song, inspect musical feedback with analyze_song, send browser-local playback commands with control_playback, then share publish_song.publicUrl. On a revision conflict, get_song and retry from the latest revision. Tool activity is public; never include private reasoning or chain-of-thought.' },
  )

  server.registerTool('create_song', {
    description: 'Create a public song with tempo, meter, subdivision, loop, key/scale, swing, note/velocity grids, reusable clips, and ordered long-form sections.',
    inputSchema: createSongSchema,
  }, async (input) => {
    const slug = secureSlug()
    return result(await responseJson(await roomFetch(env, origin, slug, '/song', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ slug, input }),
    })))
  })

  server.registerTool('get_song', {
    description: 'Read the latest canonical public song and revision.',
    inputSchema: z.object({ slug: slugSchema }).strict(),
  }, async ({ slug }) => result(await responseJson(await roomFetch(env, origin, slug, '/song'))))

  const mcpUpdateSchema = updateSongSchema.extend({ slug: slugSchema })
  server.registerTool('update_song', {
    description: 'Replace the complete canonical composition when expectedRevision matches.',
    inputSchema: mcpUpdateSchema,
  }, async ({ slug, ...input }) => result(await responseJson(await roomFetch(env, origin, slug, '/song', {
    method: 'PUT', headers: jsonHeaders, body: JSON.stringify(input),
  }))))

  server.registerTool('mutate_song', {
    description: 'Apply bounded step, tempo, swing, or transpose edits against an expected revision.',
    inputSchema: z.object({ slug: slugSchema, expectedRevision: z.number().int().min(1), mutations: z.array(mutationSchema).min(1).max(64) }).strict(),
  }, async ({ slug, expectedRevision, mutations }) => {
    const current = await responseJson(await roomFetch(env, origin, slug, '/song')) as unknown as SongSnapshot
    const next = structuredClone(current)
    for (const mutation of mutations) {
      if (mutation.operation === 'set_tempo') next.settings.bpm = mutation.bpm
      if (mutation.operation === 'set_swing') next.settings.swing = mutation.swing
      if (mutation.operation === 'transpose') {
        for (const pattern of [next.pattern, ...next.clips.map(({ pattern }) => pattern)]) {
          for (const track of pattern.tracks) if (track.id !== 'drums') {
            for (const step of track.steps) if (step.note !== undefined) step.note = Math.max(0, Math.min(127, step.note + mutation.semitones))
          }
        }
      }
      if (mutation.operation === 'set_step') {
        const step = next.pattern.tracks.find(({ id }) => id === mutation.track)!.steps[mutation.step]
        Object.assign(step, { active: mutation.active, velocity: mutation.velocity, ...(mutation.note === undefined ? {} : { note: mutation.note }) })
      }
    }
    const { slug: _, revision: __, createdAt: ___, updatedAt: ____, publicUrl: _____, ...composition } = next
    void _; void __; void ___; void ____; void _____
    const validated = updateSongSchema.parse({ ...composition, expectedRevision })
    return result(await responseJson(await roomFetch(env, origin, slug, '/song', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(validated) })))
  })

  server.registerTool('analyze_song', {
    description: 'Analyze the full arrangement: onsets, density, pitch range/contour, syncopation, repetition, energy by bar, and ASCII visualization.',
    inputSchema: z.object({ slug: slugSchema }).strict(),
  }, async ({ slug }) => {
    const song = await responseJson(await roomFetch(env, origin, slug, '/song')) as unknown as SongSnapshot
    return result(analyzeSong(song))
  })

  server.registerTool('control_playback', {
    description: 'Broadcast play, stop, seek, or tempo to all watching browsers; audio renders locally.',
    inputSchema: z.object({ slug: slugSchema, command: z.enum(['play', 'stop', 'seek', 'tempo']), atStep: z.number().int().min(0).max(1023).optional(), bpm: z.number().int().min(30).max(300).optional() }).strict(),
  }, async ({ slug, ...candidate }) => {
    const control = controlEventSchema.parse(candidate)
    return result(await responseJson(await roomFetch(env, origin, slug, '/control', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(control) })))
  })

  server.registerTool('publish_song', {
    description: 'Return the permanent public URL for an already-public song.',
    inputSchema: z.object({ slug: slugSchema }).strict(),
  }, async ({ slug }) => {
    const song = await responseJson(await roomFetch(env, origin, slug, '/song'))
    return result({ slug, revision: song.revision, publicUrl: song.publicUrl })
  })

  return server
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const server = createServer(env, new URL(request.url).origin)
  return createMcpHandler(server, { route: '/mcp', enableJsonResponse: true })(request, env, ctx)
}

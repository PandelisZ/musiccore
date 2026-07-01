import { SongRoom, type Env } from './SongRoom'
import { patternToMidi } from './midi'
import { controlEventSchema, createSongSchema, slugSchema, updateSongSchema } from './schema'

export { SongRoom }

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

function error(message: string, status: number, details?: unknown): Response {
  return new Response(JSON.stringify({ error: message, ...(details ? { details } : {}) }), { status, headers: jsonHeaders })
}

function slug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '').toLowerCase()
}

function stubRequest(url: URL, path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers)
  headers.set('x-public-origin', url.origin)
  return new Request(`${url.origin}${path}`, { ...init, headers })
}

async function parseJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 200_000) throw new Error('payload_too_large')
  return request.json()
}

async function api(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/songs' && request.method === 'POST') {
    try {
      const input = createSongSchema.parse(await parseJson(request))
      const songSlug = slug()
      return env.SONGS.getByName(songSlug).fetch(stubRequest(url, '/song', {
        method: 'POST', body: JSON.stringify({ slug: songSlug, input }), headers: jsonHeaders,
      }))
    } catch (cause) {
      return error(cause instanceof Error && cause.message === 'payload_too_large' ? 'payload_too_large' : 'invalid_request', 400)
    }
  }

  const match = url.pathname.match(/^\/api\/songs\/([^/]+)(?:\/(midi|control))?$/)
  if (!match) return null
  const parsedSlug = slugSchema.safeParse(match[1])
  if (!parsedSlug.success) return error('invalid_slug', 400)
  const stub = env.SONGS.getByName(parsedSlug.data)

  if (!match[2] && request.method === 'GET') return stub.fetch(stubRequest(url, '/song'))
  if (!match[2] && request.method === 'PUT') {
    try {
      const input = updateSongSchema.parse(await parseJson(request))
      return stub.fetch(stubRequest(url, '/song', { method: 'PUT', body: JSON.stringify(input), headers: jsonHeaders }))
    } catch { return error('invalid_request', 400) }
  }
  if (match[2] === 'control' && request.method === 'POST') {
    try {
      const control = controlEventSchema.parse(await parseJson(request))
      return stub.fetch(stubRequest(url, '/control', { method: 'POST', body: JSON.stringify(control), headers: jsonHeaders }))
    } catch { return error('invalid_request', 400) }
  }
  if (match[2] === 'midi' && request.method === 'GET') {
    const response = await stub.fetch(stubRequest(url, '/song'))
    if (!response.ok) return response
    const song = await response.json<import('./schema').SongSnapshot>()
    const midi = patternToMidi(song)
    return new Response(midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength) as ArrayBuffer, { headers: { 'content-type': 'audio/midi', 'content-disposition': `attachment; filename="${song.slug}.mid"` } })
  }
  return error('method_not_allowed', 405)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const apiResponse = await api(request, env, url)
    if (apiResponse) return apiResponse
    const websocket = url.pathname.match(/^\/ws\/([^/]+)$/)
    if (websocket) {
      const parsed = slugSchema.safeParse(websocket[1])
      if (!parsed.success) return error('invalid_slug', 400)
      return env.SONGS.getByName(parsed.data).fetch(stubRequest(url, '/websocket', request))
    }
    if (url.pathname === '/mcp') {
      const { handleMcp } = await import('./mcp')
      return handleMcp(request, env, ctx)
    }
    return env.ASSETS.fetch(request)
  },
}

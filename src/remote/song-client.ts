import type { Pattern } from '../domain/pattern'

export interface PublicSong {
  slug: string
  revision: number
  pattern: Pattern
  title?: string
  publicUrl?: string
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  bars: number
  key: string
  scale: string
  arrangement: Array<{ id: string; name: string; bars: number; pattern: Pattern }>
}

type Fetcher = typeof fetch
export type SongWrite = Omit<PublicSong, 'slug' | 'revision' | 'publicUrl' | 'createdAt' | 'updatedAt'> & { expectedRevision?: number }

export class SongConflictError extends Error {
  readonly current: PublicSong
  constructor(current: PublicSong) { super('This public song changed elsewhere.'); this.current = current }
}

async function read(response: Response): Promise<PublicSong> {
  const payload = await response.json() as PublicSong | { song: PublicSong }
  return 'song' in payload ? payload.song : payload
}

export async function createSong(input: SongWrite, fetcher: Fetcher = fetch): Promise<PublicSong> {
  const response = await fetcher('/api/songs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (!response.ok) throw new Error(`Publishing failed (${response.status})`)
  return read(response)
}

export async function getSong(slug: string, fetcher: Fetcher = fetch): Promise<PublicSong> {
  const response = await fetcher(`/api/songs/${encodeURIComponent(slug)}`)
  if (!response.ok) throw new Error(response.status === 404 ? 'Public song not found.' : `Loading failed (${response.status})`)
  return read(response)
}

export async function updateSong(slug: string, input: SongWrite, fetcher: Fetcher = fetch): Promise<PublicSong> {
  const response = await fetcher(`/api/songs/${encodeURIComponent(slug)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (response.status === 409) {
    const payload = await response.json() as Partial<PublicSong> & { current?: PublicSong }
    const current = payload.current ?? (payload.pattern ? payload as PublicSong : await getSong(slug, fetcher))
    throw new SongConflictError(current)
  }
  if (!response.ok) throw new Error(`Saving failed (${response.status})`)
  return read(response)
}

export function songSocketUrl(slug: string, location: Location = window.location): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/${encodeURIComponent(slug)}`
}

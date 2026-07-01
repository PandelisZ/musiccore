import { describe, expect, it, vi } from 'vitest'
import { createEmptyPattern } from '../domain/pattern'
import { SongConflictError, createSong, updateSong } from './song-client'

describe('song client', () => {
  const composition = () => ({
    title: 'Bright loop', pattern: createEmptyPattern(), bpm: 128,
    timeSignature: { numerator: 4, denominator: 4 }, bars: 1,
    key: 'A', scale: 'minor', arrangement: [],
  })
  it('publishes a canonical public song', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: 'bright-loop', revision: 1, pattern: createEmptyPattern() }),
    })
    const song = await createSong(composition(), fetcher)
    expect(fetcher).toHaveBeenCalledWith('/api/songs', expect.objectContaining({ method: 'POST' }))
    expect(song.revision).toBe(1)
  })

  it('surfaces the canonical revision on optimistic conflicts', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ slug: 'bright-loop', revision: 4, pattern: createEmptyPattern() }),
    })
    try {
      await updateSong('bright-loop', { ...composition(), expectedRevision: 3 }, fetcher)
      expect.fail('Expected a conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(SongConflictError)
      expect((error as SongConflictError).current.revision).toBe(4)
    }
  })
})

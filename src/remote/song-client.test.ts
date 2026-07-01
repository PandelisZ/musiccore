import { describe, expect, it, vi } from 'vitest'
import { createEmptyPattern } from '../domain/pattern'
import { SongConflictError, createSong, updateSong } from './song-client'

describe('song client', () => {
  const composition = () => ({
    title: 'Bright loop', pattern: createEmptyPattern(),
    settings: {
      bpm: 128, timeSignature: { numerator: 4, denominator: 4 as const },
      subdivision: 16 as const, loop: { startBar: 0, endBar: 1 },
      key: 'A' as const, scale: 'minor' as const, swing: 0.25,
    },
    clips: [{ id: 'main', name: 'Main loop', pattern: createEmptyPattern() }],
    arrangement: [{ id: 'loop', name: 'Loop', clipId: 'main', bars: 1, repeats: 1 }],
  })
  it('publishes a canonical public song', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: 'bright-loop', revision: 1, pattern: createEmptyPattern() }),
    })
    const song = await createSong(composition(), fetcher)
    expect(fetcher).toHaveBeenCalledWith('/api/songs', expect.objectContaining({ method: 'POST' }))
    const request = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual(composition())
    expect(JSON.parse(String(request.body))).not.toHaveProperty('bpm')
    expect(song.revision).toBe(1)
  })

  it('surfaces the canonical revision on optimistic conflicts', async () => {
    const current = { slug: 'bright-loop', revision: 4, publicUrl: '/s/bright-loop', ...composition() }
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'revision_conflict', currentRevision: 4 }),
    }).mockResolvedValueOnce({ ok: true, json: async () => current })
    try {
      await updateSong('bright-loop', { ...composition(), expectedRevision: 3 }, fetcher)
      expect.fail('Expected a conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(SongConflictError)
      expect((error as SongConflictError).current.revision).toBe(4)
      expect(fetcher).toHaveBeenLastCalledWith('/api/songs/bright-loop')
    }
  })
})

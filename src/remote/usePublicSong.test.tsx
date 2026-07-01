import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPattern } from '../domain/pattern'
import { usePublicSong } from './usePublicSong'

describe('usePublicSong publishing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('publishes the Worker canonical composition contract', async () => {
    const pattern = createEmptyPattern()
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        slug: 'bright-loop-1234567890', revision: 1, title: 'Musiccore loop', pattern,
        settings: { bpm: 128, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 16, loop: { startBar: 0, endBar: 1 }, key: 'A', scale: 'minor', swing: 0.25 },
        clips: [{ id: 'main', name: 'Main loop', pattern }], arrangement: [],
      }),
    })
    vi.stubGlobal('fetch', fetcher)
    const onSnapshot = vi.fn()
    const onCommand = vi.fn()
    const { result } = renderHook(() => usePublicSong({
      pattern,
      settings: { bpm: 128, swing: 0.25, key: 'A', scale: 'minor', density: 0.7, mutation: 0.3 },
      onSnapshot, onCommand,
    }))

    await act(() => result.current.publish())

    const body = JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body))
    expect(body).toEqual({
      title: 'Musiccore loop', pattern,
      settings: { bpm: 128, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 16, loop: { startBar: 0, endBar: 1 }, key: 'A', scale: 'minor', swing: 0.25 },
      clips: [{ id: 'main', name: 'Main loop', pattern }], arrangement: [],
    })
    expect(body).not.toHaveProperty('bpm')
    expect(body).not.toHaveProperty('bars')
  })
})

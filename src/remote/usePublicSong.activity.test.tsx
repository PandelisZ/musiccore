import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPattern } from '../domain/pattern'
import { usePublicSong } from './usePublicSong'

class FakeWebSocket {
  static latest: FakeWebSocket
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(_url: string) { FakeWebSocket.latest = this }
  close() {}
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent) }
}

describe('usePublicSong activity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads history and replaces it with bounded live socket summaries', async () => {
    const pattern = createEmptyPattern()
    const song = {
      slug: 'bright-loop-1234567890', revision: 1, title: 'Bright loop', pattern,
      settings: { bpm: 128, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 16, loop: { startBar: 0, endBar: 1 }, key: 'A', scale: 'minor', swing: 0.25 },
      clips: [{ id: 'main', name: 'Main loop', pattern }], arrangement: [],
    }
    const created = { id: 1, action: 'created', actor: 'mcp', summary: 'Created “Bright loop”', revision: 1, createdAt: '2026-07-01T10:00:00.000Z' }
    const control = { id: 2, action: 'control', actor: 'mcp', summary: 'Started playback', revision: 1, createdAt: '2026-07-01T10:01:00.000Z' }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => song })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ activity: [created] }) }))
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onSnapshot = vi.fn()
    const onCommand = vi.fn()
    const { result } = renderHook(() => usePublicSong({
      slug: song.slug, pattern,
      settings: { bpm: 128, swing: 0.25, key: 'A', scale: 'minor', density: 0.7, mutation: 0.3 },
      onSnapshot, onCommand,
    }))

    await waitFor(() => expect(result.current.activity).toEqual([created]))
    act(() => FakeWebSocket.latest.receive({ type: 'control', control: { command: 'play' }, activities: [created, control] }))
    expect(result.current.activity).toEqual([created, control])
    expect(onCommand).toHaveBeenCalledWith({ command: 'play' })
  })
})

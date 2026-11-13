import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AudioEngine } from './audio/types'
import { createEmptyPattern } from './domain/pattern'
import type { PublicSong } from './remote/song-client'

class TestSocket {
  static current: TestSocket
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor() { TestSocket.current = this }
  close() {}
  send(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }) }
}

function song(): PublicSong {
  const intro = createEmptyPattern()
  const verse = createEmptyPattern()
  intro.tracks[0].steps[0] = { active: true, velocity: 1 }
  verse.tracks[0].steps[0] = { active: true, velocity: 0.25 }
  return {
    slug: 'long-song', revision: 1, title: 'Long song', pattern: intro,
    settings: { bpm: 120, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 16, loop: { startBar: 0, endBar: 5 }, key: 'A', scale: 'minor', swing: 0 },
    clips: [{ id: 'intro', name: 'Intro', pattern: intro }, { id: 'verse', name: 'Verse', pattern: verse }],
    arrangement: [
      { id: 'intro-section', name: 'Intro', clipId: 'intro', bars: 1, repeats: 1 },
      { id: 'verse-section', name: 'Verse', clipId: 'verse', bars: 2, repeats: 2 },
    ],
  }
}

describe('long-form arrangement playback', () => {
  afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', '/') })

  it('plays a remote absolute step in the correct clip and reports section progress', async () => {
    history.replaceState(null, '', '/s/long-song')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => song() }))
    vi.stubGlobal('WebSocket', TestSocket)
    const engine: AudioEngine = { currentTime: () => 0, start: vi.fn().mockResolvedValue(undefined), scheduleVoice: vi.fn(), stopAll: vi.fn(), cleanup: vi.fn() }
    render(<App audioEngine={engine} />)
    await screen.findByText('Public · live read/write')

    TestSocket.current.send({ type: 'control', control: { command: 'seek', atStep: 48 } })
    TestSocket.current.send({ type: 'control', control: { command: 'play' } })

    await waitFor(() => expect(engine.scheduleVoice).toHaveBeenCalledWith('drums', expect.objectContaining({ velocity: 0.25 }), expect.any(Number)))
    expect(await screen.findByText(/Verse · bar 1\/2 · repeat 2\/2 · song bar 4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drums step 1' })).toHaveClass('is-current')
  })
})

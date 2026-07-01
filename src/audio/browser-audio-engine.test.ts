import { describe, expect, it, vi } from 'vitest'

import { BrowserAudioEngine } from './browser-audio-engine'

function createAudioContext() {
  const starts: number[] = []
  const stops: number[] = []
  const oscillators: Array<{ type: OscillatorType; frequency: { setValueAtTime: ReturnType<typeof vi.fn> } }> = []
  const context = {
    currentTime: 4,
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createOscillator: () => {
      const oscillator = {
        type: 'sine' as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn((when: number) => starts.push(when)),
        stop: vi.fn((when: number) => stops.push(when)),
        disconnect: vi.fn(),
        onended: null as (() => void) | null,
      }
      oscillators.push(oscillator)
      return oscillator
    },
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(32) })),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn((when: number) => starts.push(when)),
      stop: vi.fn((when: number) => stops.push(when)),
      disconnect: vi.fn(),
      onended: null as (() => void) | null,
    }),
    sampleRate: 44100,
  }
  return { context, starts, stops, oscillators }
}

describe('BrowserAudioEngine', () => {
  it('creates and resumes a browser audio context on start', async () => {
    const { context } = createAudioContext()
    const engine = new BrowserAudioEngine(() => context)
    await engine.start()
    expect(context.resume).toHaveBeenCalledOnce()
    expect(engine.currentTime()).toBe(4)
  })

  it('schedules distinct drum, bass, and melody voices', async () => {
    const { context, starts, oscillators } = createAudioContext()
    const engine = new BrowserAudioEngine(() => context)
    await engine.start()
    engine.scheduleVoice('drums', { active: true, velocity: 1, note: 36 }, 5)
    engine.scheduleVoice('bass', { active: true, velocity: 0.8, note: 48 }, 5.1)
    engine.scheduleVoice('melody', { active: true, velocity: 0.7, note: 69 }, 5.2)

    expect(starts).toEqual([5, 5.1, 5.2])
    expect(oscillators.map((oscillator) => oscillator.type)).toEqual(['sawtooth', 'triangle'])
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(440, 5.2)
  })

  it('stops voices and closes the context during cleanup', async () => {
    const { context, stops } = createAudioContext()
    const engine = new BrowserAudioEngine(() => context)
    await engine.start()
    engine.scheduleVoice('bass', { active: true, velocity: 1, note: 48 }, 5)
    engine.stopAll()
    expect(stops.at(-1)).toBe(4)
    engine.cleanup()
    expect(context.close).toHaveBeenCalledOnce()
  })
})

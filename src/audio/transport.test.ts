import { describe, expect, it, vi } from 'vitest'

import type { Pattern } from '../domain/pattern'
import type { AudioEngine } from './types'
import { LookAheadTransport } from './transport'

const pattern: Pattern = {
  tracks: [
    { id: 'drums', steps: Array.from({ length: 16 }, (_, index) => ({ active: index === 0, velocity: 1, note: 36 })) },
    { id: 'bass', steps: Array.from({ length: 16 }, (_, index) => ({ active: index === 1, velocity: 0.8, note: 48 })) },
    { id: 'melody', steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 1, note: 60 })) },
  ],
}

function setup() {
  let now = 10
  let tick: (() => void) | undefined
  const engine: AudioEngine = {
    currentTime: () => now,
    start: vi.fn(async () => undefined),
    scheduleVoice: vi.fn(),
    stopAll: vi.fn(),
    cleanup: vi.fn(),
  }
  const setIntervalFn = vi.fn((callback: () => void) => {
    tick = callback
    return 7
  })
  const clearIntervalFn = vi.fn()
  const activeSteps: number[] = []
  const transport = new LookAheadTransport(engine, {
    lookAheadSeconds: 0.14,
    setInterval: setIntervalFn,
    clearInterval: clearIntervalFn,
    onActiveStep: (step) => activeSteps.push(step),
  })
  return { engine, transport, activeSteps, tick: () => tick?.(), setNow: (value: number) => (now = value), clearIntervalFn }
}

describe('LookAheadTransport', () => {
  it('starts the engine and schedules active voices in the look-ahead window', async () => {
    const { engine, transport, activeSteps } = setup()
    await transport.start(pattern, { bpm: 120, swing: 0 })

    expect(engine.start).toHaveBeenCalledOnce()
    expect(engine.scheduleVoice).toHaveBeenCalledWith('drums', pattern.tracks[0].steps[0], 10)
    expect(activeSteps).toEqual([0, 1])
  })

  it('wraps after sixteen steps', async () => {
    const { transport, activeSteps, tick, setNow } = setup()
    await transport.start(pattern, { bpm: 600, swing: 0 })
    setNow(10.79)
    tick()

    expect(activeSteps.filter((step) => step === 0).length).toBeGreaterThanOrEqual(2)
    expect(activeSteps.every((step) => step >= 0 && step < 16)).toBe(true)
  })

  it('stops scheduled audio and releases its timer', async () => {
    const { engine, transport, clearIntervalFn } = setup()
    await transport.start(pattern, { bpm: 120, swing: 0 })
    transport.stop()

    expect(clearIntervalFn).toHaveBeenCalledWith(7)
    expect(engine.stopAll).toHaveBeenCalledOnce()
    expect(transport.isPlaying).toBe(false)
  })

  it('cleans up the transport and audio engine', () => {
    const { engine, transport } = setup()
    transport.cleanup()
    expect(engine.cleanup).toHaveBeenCalledOnce()
  })
})

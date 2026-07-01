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
  return { engine, transport, activeSteps, tick: () => tick?.(), setNow: (value: number) => (now = value), clearIntervalFn, setIntervalFn }
}

describe('LookAheadTransport', () => {
  it('starts the engine and schedules active voices in the look-ahead window', async () => {
    const { engine, transport, activeSteps } = setup()
    await transport.start(pattern, { bpm: 120, swing: 0 })

    expect(engine.start).toHaveBeenCalledOnce()
    expect(engine.scheduleVoice).toHaveBeenCalledWith('drums', pattern.tracks[0].steps[0], 10.01)
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

  it('rejects invalid input before starting the audio engine', async () => {
    const { engine, transport } = setup()
    const invalidPattern = structuredClone(pattern)
    invalidPattern.tracks[1].steps[1].note = 128

    await expect(transport.start(invalidPattern, { bpm: 120, swing: 0 })).rejects.toThrow(
      'Invalid pattern',
    )
    await expect(transport.start(pattern, { bpm: 0, swing: 0 })).rejects.toThrow(
      'Invalid transport settings',
    )
    expect(engine.start).not.toHaveBeenCalled()
  })

  it('cleans up a rejected start and can be retried', async () => {
    const { engine, transport } = setup()
    vi.mocked(engine.start).mockRejectedValueOnce(new Error('gesture required'))

    await expect(transport.start(pattern, { bpm: 120, swing: 0 })).rejects.toThrow('gesture required')
    expect(transport.isPlaying).toBe(false)
    expect(engine.stopAll).toHaveBeenCalledOnce()

    await expect(transport.start(pattern, { bpm: 120, swing: 0 })).resolves.toBeUndefined()
    expect(engine.start).toHaveBeenCalledTimes(2)
    expect(transport.isPlaying).toBe(true)
  })

  it('updates pattern and settings while playing without creating duplicate timers', async () => {
    const { engine, transport, setIntervalFn } = setup()
    await transport.start(pattern, { bpm: 120, swing: 0 })
    const replacement = structuredClone(pattern)
    replacement.tracks[0].steps[0].active = false
    replacement.tracks[2].steps[0].active = true

    transport.setPattern(replacement)
    transport.setSettings({ bpm: 90, swing: 0.2 })

    expect(engine.stopAll).toHaveBeenCalledTimes(2)
    expect(setIntervalFn).toHaveBeenCalledOnce()
    expect(transport.isPlaying).toBe(true)
  })

  it('seeks and loops within an end-exclusive step range without adding a timer', async () => {
    const { transport, activeSteps, tick, setNow } = setup()
    await transport.start(pattern, { bpm: 600, swing: 0 })

    transport.setLoopRange(4, 8)
    transport.seek(6)
    setNow(11)
    tick()

    expect(activeSteps.slice(-8).every((step) => step >= 4 && step < 8)).toBe(true)
    expect(() => transport.setLoopRange(8, 8)).toThrow(RangeError)
    expect(() => transport.seek(16)).toThrow(RangeError)
  })
})

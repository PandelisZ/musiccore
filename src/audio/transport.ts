import { STEPS_PER_TRACK, type Pattern } from '../domain/pattern'
import { stepOffsetSeconds } from './timing'
import type { AudioEngine, TransportSettings } from './types'

type TimerHandle = ReturnType<typeof globalThis.setInterval>

interface TransportOptions {
  lookAheadSeconds?: number
  schedulerIntervalMs?: number
  onActiveStep?: (step: number, when: number) => void
  setInterval?: (callback: () => void, milliseconds: number) => TimerHandle
  clearInterval?: (handle: TimerHandle) => void
}

export class LookAheadTransport {
  private readonly engine: AudioEngine
  private timer: TimerHandle | undefined
  private pattern: Pattern | undefined
  private settings: TransportSettings | undefined
  private sequenceStep = 0
  private startedAt = 0
  private readonly lookAheadSeconds: number
  private readonly schedulerIntervalMs: number
  private readonly onActiveStep: (step: number, when: number) => void
  private readonly setIntervalFn: (callback: () => void, milliseconds: number) => TimerHandle
  private readonly clearIntervalFn: (handle: TimerHandle) => void

  constructor(engine: AudioEngine, options: TransportOptions = {}) {
    this.engine = engine
    this.lookAheadSeconds = options.lookAheadSeconds ?? 0.1
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? 25
    this.onActiveStep = options.onActiveStep ?? (() => undefined)
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval.bind(globalThis)
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval.bind(globalThis)
  }

  get isPlaying(): boolean {
    return this.timer !== undefined
  }

  async start(pattern: Pattern, settings: TransportSettings): Promise<void> {
    if (this.isPlaying) return
    await this.engine.start()
    this.pattern = pattern
    this.settings = settings
    this.sequenceStep = 0
    this.startedAt = this.engine.currentTime()
    this.scheduleWindow()
    this.timer = this.setIntervalFn(() => this.scheduleWindow(), this.schedulerIntervalMs)
  }

  stop(): void {
    if (this.timer !== undefined) {
      this.clearIntervalFn(this.timer)
      this.timer = undefined
    }
    this.pattern = undefined
    this.settings = undefined
    this.engine.stopAll()
  }

  cleanup(): void {
    this.stop()
    this.engine.cleanup()
  }

  private scheduleWindow(): void {
    if (!this.pattern || !this.settings) return
    const horizon = this.engine.currentTime() + this.lookAheadSeconds

    while (this.scheduledTime(this.sequenceStep) <= horizon) {
      const when = this.scheduledTime(this.sequenceStep)
      const stepIndex = this.sequenceStep % STEPS_PER_TRACK
      for (const track of this.pattern.tracks) {
        const step = track.steps[stepIndex]
        if (step?.active) this.engine.scheduleVoice(track.id, step, when)
      }
      this.onActiveStep(stepIndex, when)
      this.sequenceStep += 1
    }
  }

  private scheduledTime(sequenceStep: number): number {
    if (!this.settings) return Number.POSITIVE_INFINITY
    return this.startedAt + stepOffsetSeconds(sequenceStep, this.settings.bpm, this.settings.swing)
  }
}

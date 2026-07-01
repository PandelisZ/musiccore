import { STEPS_PER_TRACK, validatePattern, type Pattern } from '../domain/pattern'
import { stepOffsetSeconds } from './timing'
import { validateTransportSettings, type AudioEngine, type TransportSettings } from './types'

type TimerHandle = ReturnType<typeof globalThis.setInterval>

interface TransportOptions {
  lookAheadSeconds?: number
  schedulerIntervalMs?: number
  startLeadSeconds?: number
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
  private positionBase = 0
  private loopStart = 0
  private loopEnd = STEPS_PER_TRACK
  private startedAt = 0
  private startAttempt = 0
  private startPromise: Promise<void> | undefined
  private readonly lookAheadSeconds: number
  private readonly schedulerIntervalMs: number
  private readonly startLeadSeconds: number
  private readonly onActiveStep: (step: number, when: number) => void
  private readonly setIntervalFn: (callback: () => void, milliseconds: number) => TimerHandle
  private readonly clearIntervalFn: (handle: TimerHandle) => void

  constructor(engine: AudioEngine, options: TransportOptions = {}) {
    this.engine = engine
    this.lookAheadSeconds = options.lookAheadSeconds ?? 0.1
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? 25
    this.startLeadSeconds = options.startLeadSeconds ?? 0.01
    this.onActiveStep = options.onActiveStep ?? (() => undefined)
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval.bind(globalThis)
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval.bind(globalThis)
  }

  get isPlaying(): boolean {
    return this.timer !== undefined
  }

  async start(pattern: Pattern, settings: TransportSettings): Promise<void> {
    if (this.isPlaying) return
    if (!validatePattern(pattern)) throw new TypeError('Invalid pattern')
    if (!validateTransportSettings(settings)) throw new TypeError('Invalid transport settings')
    if (this.startPromise) return this.startPromise

    const attempt = ++this.startAttempt
    this.startPromise = (async () => {
      try {
        await this.engine.start()
        if (attempt !== this.startAttempt) return
        this.pattern = pattern
        this.settings = settings
        this.sequenceStep = 0
        this.positionBase = this.loopStart
        this.startedAt = this.engine.currentTime() + this.startLeadSeconds
        this.scheduleWindow()
        this.timer = this.setIntervalFn(() => this.scheduleWindow(), this.schedulerIntervalMs)
      } catch (error) {
        this.resetPlaybackState()
        this.engine.stopAll()
        throw error
      } finally {
        if (attempt === this.startAttempt) this.startPromise = undefined
      }
    })()
    return this.startPromise
  }

  setPattern(pattern: Pattern): void {
    if (!validatePattern(pattern)) throw new TypeError('Invalid pattern')
    this.pattern = pattern
    this.rescheduleFromNextStep()
  }

  setSettings(settings: TransportSettings): void {
    if (!validateTransportSettings(settings)) throw new TypeError('Invalid transport settings')
    this.settings = settings
    this.rescheduleFromNextStep()
  }

  seek(step: number): void {
    if (!Number.isInteger(step) || step < this.loopStart || step >= this.loopEnd) {
      throw new RangeError(`Seek step must be between ${this.loopStart} and ${this.loopEnd - 1}`)
    }
    this.positionBase = step
    this.reschedule()
  }

  setLoopRange(startStep: number, endStep: number): void {
    if (
      !Number.isInteger(startStep) ||
      !Number.isInteger(endStep) ||
      startStep < 0 ||
      endStep > STEPS_PER_TRACK ||
      startStep >= endStep
    ) {
      throw new RangeError(`Loop range must be within 0..${STEPS_PER_TRACK} and non-empty`)
    }
    this.loopStart = startStep
    this.loopEnd = endStep
    this.positionBase = startStep
    this.reschedule()
  }

  stop(): void {
    this.startAttempt += 1
    this.startPromise = undefined
    if (this.timer !== undefined) {
      this.clearIntervalFn(this.timer)
      this.timer = undefined
    }
    this.resetPlaybackState()
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
      const stepIndex = this.stepIndexForSequence(this.sequenceStep)
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

  private stepIndexForSequence(sequenceStep: number): number {
    const loopLength = this.loopEnd - this.loopStart
    return this.loopStart + ((this.positionBase - this.loopStart + sequenceStep) % loopLength)
  }

  private rescheduleFromNextStep(): void {
    if (!this.isPlaying) return
    this.positionBase = this.stepIndexForSequence(this.sequenceStep)
    this.reschedule()
  }

  private reschedule(): void {
    if (!this.isPlaying) return
    this.engine.stopAll()
    this.sequenceStep = 0
    this.startedAt = this.engine.currentTime() + this.startLeadSeconds
    this.scheduleWindow()
  }

  private resetPlaybackState(): void {
    this.pattern = undefined
    this.settings = undefined
    this.sequenceStep = 0
  }
}

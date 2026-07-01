import type { Step, TrackId } from '../domain/pattern'
import type { AudioEngine } from './types'

interface AudioParamLike {
  setValueAtTime(value: number, time: number): void
  exponentialRampToValueAtTime(value: number, endTime: number): void
}

interface SourceLike {
  connect(destination: unknown): void
  disconnect(): void
  start(when: number): void
  stop(when: number): void
  onended: ((event: Event) => unknown) | null
}

interface OscillatorLike extends SourceLike {
  type: OscillatorType
  frequency: Pick<AudioParamLike, 'setValueAtTime'>
}

interface GainLike {
  gain: AudioParamLike
  connect(destination: unknown): void
  disconnect(): void
}

interface BufferLike {
  getChannelData(channel: number): Float32Array
}

interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null
}

interface AudioContextLike {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  readonly sampleRate: number
  resume(): Promise<void>
  close(): Promise<void>
  createGain(): GainLike
  createOscillator(): OscillatorLike
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike
  createBufferSource(): BufferSourceLike
}

type ContextFactory = () => AudioContextLike

function defaultContextFactory(): AudioContextLike {
  const AudioContextConstructor = window.AudioContext
  return new AudioContextConstructor()
}

function midiFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

export class BrowserAudioEngine implements AudioEngine {
  private context: AudioContextLike | undefined
  private readonly voices = new Set<SourceLike>()
  private readonly createContext: ContextFactory

  constructor(createContext: ContextFactory = defaultContextFactory) {
    this.createContext = createContext
  }

  currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  async start(): Promise<void> {
    this.context ??= this.createContext()
    if (this.context.state === 'suspended') await this.context.resume()
  }

  scheduleVoice(trackId: TrackId, step: Step, when: number): void {
    const context = this.context
    if (!context || !step.active) return
    if (trackId === 'drums') this.scheduleDrum(context, step, when)
    else this.scheduleOscillator(context, trackId, step, when)
  }

  stopAll(): void {
    const now = this.currentTime()
    for (const voice of this.voices) {
      try {
        voice.stop(now)
      } catch {
        // A voice may already have naturally ended.
      }
      voice.disconnect()
    }
    this.voices.clear()
  }

  cleanup(): void {
    this.stopAll()
    void this.context?.close()
    this.context = undefined
  }

  private scheduleDrum(context: AudioContextLike, step: Step, when: number): void {
    const duration = 0.08
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
    const buffer = context.createBuffer(1, frameCount, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    this.connectEnvelope(context, source, step.velocity, when, duration)
  }

  private scheduleOscillator(
    context: AudioContextLike,
    trackId: Exclude<TrackId, 'drums'>,
    step: Step,
    when: number,
  ): void {
    const oscillator = context.createOscillator()
    oscillator.type = trackId === 'bass' ? 'sawtooth' : 'triangle'
    oscillator.frequency.setValueAtTime(midiFrequency(step.note ?? (trackId === 'bass' ? 36 : 60)), when)
    this.connectEnvelope(context, oscillator, step.velocity, when, trackId === 'bass' ? 0.18 : 0.28)
  }

  private connectEnvelope(
    context: AudioContextLike,
    source: SourceLike,
    velocity: number,
    when: number,
    duration: number,
  ): void {
    const gain = context.createGain()
    gain.gain.setValueAtTime(Math.max(0.0001, velocity * 0.22), when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    source.connect(gain)
    gain.connect(context.destination)
    source.onended = () => {
      this.voices.delete(source)
      source.disconnect()
      gain.disconnect()
    }
    this.voices.add(source)
    source.start(when)
    source.stop(when + duration)
  }
}

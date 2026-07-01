import type { Step, TrackId } from '../domain/pattern'

export interface TransportSettings {
  bpm: number
  swing: number
}

export interface AudioEngine {
  currentTime(): number
  start(): Promise<void>
  scheduleVoice(trackId: TrackId, step: Step, when: number): void
  stopAll(): void
  cleanup(): void
}

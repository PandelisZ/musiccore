import type { Step, TrackId } from '../domain/pattern'

export interface TransportSettings {
  bpm: number
  swing: number
}

export function validateTransportSettings(value: unknown): value is TransportSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as Record<string, unknown>
  return (
    typeof settings.bpm === 'number' &&
    Number.isFinite(settings.bpm) &&
    settings.bpm > 0 &&
    typeof settings.swing === 'number' &&
    Number.isFinite(settings.swing) &&
    settings.swing >= 0 &&
    settings.swing <= 1
  )
}

export interface AudioEngine {
  currentTime(): number
  start(): Promise<void>
  scheduleVoice(trackId: TrackId, step: Step, when: number): void
  stopAll(): void
  cleanup(): void
}

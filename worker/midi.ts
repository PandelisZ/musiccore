import type { CreateSongInput, PatternInput } from './schema'

const text = (value: string) => [...new TextEncoder().encode(value)]
const u16 = (value: number) => [(value >>> 8) & 255, value & 255]
const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f]
  for (value >>>= 7; value > 0; value >>>= 7) bytes.unshift((value & 0x7f) | 0x80)
  return bytes
}

function midiTrack(events: number[]): number[] {
  const body = [...events, 0, 0xff, 0x2f, 0]
  return [...text('MTrk'), ...u32(body.length), ...body]
}

export function patternToMidi(pattern: PatternInput, bpm: number): Uint8Array
export function patternToMidi(song: CreateSongInput): Uint8Array
export function patternToMidi(songOrPattern: CreateSongInput | PatternInput, legacyBpm?: number): Uint8Array {
  const isSong = 'settings' in songOrPattern
  const bpm = isSong ? songOrPattern.settings.bpm : (legacyBpm ?? 120)
  const basePattern = isSong ? songOrPattern.pattern : songOrPattern
  const clips = isSong ? new Map(songOrPattern.clips.map((clip) => [clip.id, clip.pattern])) : new Map<string, PatternInput>()
  const bars = isSong && songOrPattern.arrangement.length
    ? songOrPattern.arrangement.flatMap((section) => Array.from({ length: section.bars * section.repeats }, () => clips.get(section.clipId) ?? basePattern))
    : [basePattern]
  const ticksPerQuarter = 96
  const numerator = isSong ? songOrPattern.settings.timeSignature.numerator : 4
  const denominator = isSong ? songOrPattern.settings.timeSignature.denominator : 4
  const stepTicks = ticksPerQuarter * numerator * (4 / denominator) / 16
  const swing = isSong ? songOrPattern.settings.swing : 0
  const tempo = Math.round(60_000_000 / bpm)
  const tracks = basePattern.tracks.map((baseTrack, trackIndex) => {
    const events: Array<{ tick: number; order: number; bytes: number[] }> = []
    if (trackIndex === 0) {
      events.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 3, (tempo >>> 16) & 255, (tempo >>> 8) & 255, tempo & 255] })
      events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 4, numerator, Math.log2(denominator), 24, 8] })
    }
    bars.forEach((bar, barIndex) => {
      const track = bar.tracks.find(({ id }) => id === baseTrack.id) ?? baseTrack
      track.steps.forEach((step, index) => {
        if (!step.active) return
        const note = step.note ?? (track.id === 'drums' ? 36 : 60)
        const channel = track.id === 'drums' ? 9 : trackIndex
        const velocity = Math.max(1, Math.min(127, Math.round(step.velocity * 127)))
        const swingDelay = index % 2 === 1 ? Math.round(stepTicks * swing) : 0
        const tick = (barIndex * 16 + index) * stepTicks + swingDelay
        events.push({ tick, order: 1, bytes: [0x90 | channel, note, velocity] })
        events.push({ tick: tick + stepTicks, order: 0, bytes: [0x80 | channel, note, 0] })
      })
    })
    events.sort((a, b) => a.tick - b.tick || a.order - b.order)
    let previousTick = 0
    const body: number[] = []
    for (const event of events) {
      body.push(...variableLength(event.tick - previousTick), ...event.bytes)
      previousTick = event.tick
    }
    return midiTrack(body)
  })
  const header = [...text('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(ticksPerQuarter)]
  return new Uint8Array([...header, ...tracks.flat()])
}

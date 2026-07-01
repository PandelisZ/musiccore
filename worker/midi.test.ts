import { describe, expect, it } from 'vitest'
import { patternToMidi } from './midi'
import type { CreateSongInput } from './schema'
import { testPattern, testSongInput } from './test-helpers'

describe('patternToMidi', () => {
  it('writes a standard MIDI file with one track per instrument', () => {
    const midi = patternToMidi(testPattern(), 120)

    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd')
    expect(new DataView(midi.buffer).getUint16(10)).toBe(3)
  })

  it('serializes every arranged bar using canonical settings', () => {
    const song: CreateSongInput = testSongInput()
    song.clips[0].pattern.tracks[1].steps[1].active = true
    const midi = patternToMidi(song)
    const view = new DataView(midi.buffer)

    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd')
    expect(view.getUint16(12)).toBe(96)
    expect(new TextDecoder().decode(midi).match(/MTrk/g)).toHaveLength(3)
    expect(midi.byteLength).toBeGreaterThan(patternToMidi({ ...song, arrangement: [] }).byteLength)
  })

  it('encodes meter and applies canonical swing timing', () => {
    const song: CreateSongInput = testSongInput()
    song.clips[0].pattern.tracks[1].steps[1].active = true
    const straight = patternToMidi({ ...song, settings: { ...song.settings, swing: 0 } })
    const swung = patternToMidi(song)

    expect([...swung]).toContain(0x58)
    expect([...swung]).not.toEqual([...straight])
  })

  it('quantizes fractional absolute ticks to monotonic integer MIDI deltas', () => {
    const song: CreateSongInput = testSongInput()
    song.settings.timeSignature = { numerator: 1, denominator: 16 }
    song.settings.subdivision = 32
    song.settings.swing = 0.13
    song.clips[0].pattern.tracks[1].steps.forEach((step) => { step.active = true })

    const midi = patternToMidi(song)
    expect(midi.byteLength).toBeLessThan(100_000)
    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd')
  })

  it('rejects an unvalidated oversized arrangement before MIDI expansion', () => {
    const song: CreateSongInput = testSongInput()
    song.pattern.tracks.forEach((track) => track.steps.forEach((step) => { step.active = false }))
    song.clips[0].pattern = song.pattern
    song.arrangement = Array.from({ length: 32 }, (_, index) => ({
      id: `section-${index}`, name: `Section ${index}`, clipId: 'main', bars: 64, repeats: 16,
    }))

    expect(() => patternToMidi(song)).toThrow('Arrangement may expand to at most 256 bars')
  })
})

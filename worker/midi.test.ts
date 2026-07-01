import { describe, expect, it } from 'vitest'
import { patternToMidi } from './midi'
import { testPattern, testSongInput } from './test-helpers'

describe('patternToMidi', () => {
  it('writes a standard MIDI file with one track per instrument', () => {
    const midi = patternToMidi(testPattern(), 120)

    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd')
    expect(new DataView(midi.buffer).getUint16(10)).toBe(3)
  })

  it('serializes every arranged bar using canonical settings', () => {
    const song = testSongInput()
    song.clips[0].pattern.tracks[1].steps[1].active = true
    const midi = patternToMidi(song)
    const view = new DataView(midi.buffer)

    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd')
    expect(view.getUint16(12)).toBe(96)
    expect(new TextDecoder().decode(midi).match(/MTrk/g)).toHaveLength(3)
    expect(midi.byteLength).toBeGreaterThan(patternToMidi({ ...song, arrangement: [] }).byteLength)
  })

  it('encodes meter and applies canonical swing timing', () => {
    const song = testSongInput()
    song.clips[0].pattern.tracks[1].steps[1].active = true
    const straight = patternToMidi({ ...song, settings: { ...song.settings, swing: 0 } })
    const swung = patternToMidi(song)

    expect([...swung]).toContain(0x58)
    expect([...swung]).not.toEqual([...straight])
  })
})

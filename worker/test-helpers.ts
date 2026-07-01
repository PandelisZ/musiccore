import type { Pattern } from '../src/domain/pattern'

export function testPattern(note = 60): Pattern {
  return {
    tracks: (['drums', 'bass', 'melody'] as const).map((id) => ({
      id,
      steps: Array.from({ length: 16 }, (_, index) => ({
        active: index % 4 === 0,
        velocity: index % 4 === 0 ? 0.8 : 0.5,
        note: id === 'drums' ? 36 : note + index,
      })),
    })),
  }
}

export function testSongInput(note = 60) {
  return {
    title: 'First light',
    pattern: testPattern(note),
    settings: {
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 as const },
      subdivision: 16 as const,
      loop: { startBar: 0, endBar: 4 },
      key: 'C' as const,
      scale: 'minor' as const,
      swing: 0.1,
    },
    clips: [
      { id: 'main', name: 'Main groove', pattern: testPattern(note) },
      { id: 'drop', name: 'Drop', pattern: testPattern(note + 12) },
    ],
    arrangement: [
      { id: 'intro', name: 'Intro', clipId: 'main', bars: 2, repeats: 1 },
      { id: 'drop-section', name: 'Drop', clipId: 'drop', bars: 4, repeats: 2 },
    ],
  }
}

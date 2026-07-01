import { describe, expect, it } from 'vitest'

import { validatePattern } from './pattern'
import {
  DeterministicPatternGenerator,
  type GeneratorSettings,
  type PatternGenerator,
} from './generator'

const settings: GeneratorSettings = {
  seed: 'midnight-drive',
  key: 'C',
  scale: 'minor',
  density: 0.55,
  mutation: 0.15,
}

describe('DeterministicPatternGenerator', () => {
  it('implements the asynchronous provider boundary', async () => {
    const provider: PatternGenerator = new DeterministicPatternGenerator()

    await expect(provider.generate(settings)).resolves.toSatisfy(validatePattern)
  })

  it('returns the same pattern for identical settings', async () => {
    const generator = new DeterministicPatternGenerator()

    expect(await generator.generate(settings)).toEqual(await generator.generate(settings))
  })

  it('uses the seed to produce different musical material', async () => {
    const generator = new DeterministicPatternGenerator()

    expect(await generator.generate(settings)).not.toEqual(
      await generator.generate({ ...settings, seed: 'sunrise-drive' }),
    )
  })

  it('creates valid MIDI notes and normalized velocities on every track', async () => {
    const pattern = await new DeterministicPatternGenerator().generate(settings)

    expect(validatePattern(pattern)).toBe(true)
    for (const track of pattern.tracks) {
      for (const step of track.steps) {
        expect(step.velocity).toBeGreaterThanOrEqual(0)
        expect(step.velocity).toBeLessThanOrEqual(1)
        if (step.note !== undefined) {
          expect(Number.isInteger(step.note)).toBe(true)
          expect(step.note).toBeGreaterThanOrEqual(0)
          expect(step.note).toBeLessThanOrEqual(127)
        }
      }
    }
  })

  it('anchors drums and bass on the first downbeat', async () => {
    const pattern = await new DeterministicPatternGenerator().generate(settings)
    const drums = pattern.tracks.find((track) => track.id === 'drums')!
    const bass = pattern.tracks.find((track) => track.id === 'bass')!

    expect(drums.steps[0]).toMatchObject({ active: true, note: 36 })
    expect(bass.steps[0].active).toBe(true)
    expect(bass.steps[0].note).toBe(36)
  })

  it('increases active steps as density rises', async () => {
    const generator = new DeterministicPatternGenerator()
    const low = await generator.generate({ ...settings, density: 0.1 })
    const high = await generator.generate({ ...settings, density: 0.9 })
    const activeCount = (pattern: Awaited<ReturnType<PatternGenerator['generate']>>) =>
      pattern.tracks.flatMap((track) => track.steps).filter((step) => step.active).length

    expect(activeCount(high)).toBeGreaterThan(activeCount(low))
  })

  it.each([
    [{ ...settings, seed: '' }, 'seed'],
    [{ ...settings, seed: Number.NaN }, 'seed'],
    [{ ...settings, density: -0.1 }, 'density'],
    [{ ...settings, density: 1.1 }, 'density'],
    [{ ...settings, mutation: Number.NaN }, 'mutation'],
  ])('rejects invalid settings %#', async (invalid, field) => {
    await expect(new DeterministicPatternGenerator().generate(invalid)).rejects.toThrow(field)
  })
})

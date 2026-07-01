export function stepDurationSeconds(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be greater than zero')
  return 60 / bpm / 4
}

export function stepOffsetSeconds(step: number, bpm: number, swing: number): number {
  if (!Number.isInteger(step) || step < 0) throw new RangeError('Step must be a non-negative integer')
  if (!Number.isFinite(swing) || swing < 0 || swing > 1) {
    throw new RangeError('Swing must be between zero and one')
  }

  const duration = stepDurationSeconds(bpm)
  return step * duration + (step % 2 === 1 ? duration * swing : 0)
}

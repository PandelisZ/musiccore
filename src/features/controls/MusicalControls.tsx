import { MUSICAL_KEYS, MUSICAL_SCALES, type GeneratorSettings } from '../../domain/generator'

export interface InstrumentSettings extends Omit<GeneratorSettings, 'seed'> {
  bpm: number
  swing: number
}

interface Props {
  settings: InstrumentSettings
  onChange: (settings: InstrumentSettings) => void
}

function RangeControl({ label, value, min, max, suffix, onChange }: {
  label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void
}) {
  return (
    <label className="control-card">
      <span className="control-label">{label}</span>
      <span><strong className="control-value">{value}</strong><small>{suffix}</small></span>
      <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

export function MusicalControls({ settings, onChange }: Props) {
  const set = <K extends keyof InstrumentSettings>(key: K, value: InstrumentSettings[K]) => onChange({ ...settings, [key]: value })
  return (
    <section className="control-rack" aria-label="Musical controls">
      <RangeControl label="Tempo" value={settings.bpm} min={60} max={200} suffix=" BPM" onChange={(value) => set('bpm', value)} />
      <RangeControl label="Swing" value={Math.round(settings.swing * 100)} min={0} max={75} suffix="%" onChange={(value) => set('swing', value / 100)} />
      <label className="control-card"><span className="control-label">Key</span><select aria-label="Key" value={settings.key} onChange={(event) => set('key', event.target.value as InstrumentSettings['key'])}>{MUSICAL_KEYS.map((key) => <option key={key}>{key}</option>)}</select></label>
      <label className="control-card"><span className="control-label">Scale</span><select aria-label="Scale" value={settings.scale} onChange={(event) => set('scale', event.target.value as InstrumentSettings['scale'])}>{MUSICAL_SCALES.map((scale) => <option key={scale} value={scale}>{scale[0].toUpperCase() + scale.slice(1)}</option>)}</select></label>
      <RangeControl label="Density" value={Math.round(settings.density * 100)} min={0} max={100} suffix="%" onChange={(value) => set('density', value / 100)} />
      <RangeControl label="Mutation" value={Math.round(settings.mutation * 100)} min={0} max={100} suffix="%" onChange={(value) => set('mutation', value / 100)} />
    </section>
  )
}

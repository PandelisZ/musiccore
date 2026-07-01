import type { Pattern, TrackId } from '../../domain/pattern'

const TRACK_COPY: Record<TrackId, { label: string; icon: string }> = {
  drums: { label: 'Drums', icon: '◉' },
  bass: { label: 'Bass', icon: '♬' },
  melody: { label: 'Melody', icon: '⌁' },
}

interface SequencerProps {
  pattern: Pattern
  activeStep: number
  onToggle: (trackId: TrackId, stepIndex: number) => void
}

export function Sequencer({ pattern, activeStep, onToggle }: SequencerProps) {
  return (
    <section className="sequencer" aria-label="16 step sequencer">
      <div className="step-header" aria-hidden="true">
        <span>Step</span>
        <div className="step-numbers">
          {Array.from({ length: 16 }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
      </div>
      {pattern.tracks.map((track) => {
        const copy = TRACK_COPY[track.id]
        return (
          <div className={`track-row track-${track.id}`} key={track.id}>
            <div className="track-label">
              <span className="track-icon" aria-hidden="true">{copy.icon}</span>
              <span>{copy.label}</span>
              <small>{track.steps.filter((step) => step.active).length} hits</small>
            </div>
            <div className="step-grid" role="group" aria-label={`${copy.label} track`}>
              {track.steps.map((step, index) => (
                <button
                  aria-label={`${copy.label} step ${index + 1}`}
                  aria-pressed={step.active}
                  className={`step ${activeStep === index ? 'is-current' : ''}`}
                  key={index}
                  onClick={() => onToggle(track.id, index)}
                  type="button"
                ><span /></button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

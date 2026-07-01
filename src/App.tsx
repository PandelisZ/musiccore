import { useCallback, useMemo, useRef, useState } from 'react'
import { BrowserAudioEngine } from './audio/browser-audio-engine'
import { LookAheadTransport } from './audio/transport'
import type { AudioEngine } from './audio/types'
import { DeterministicPatternGenerator } from './domain/generator'
import { clearPattern, createEmptyPattern, toggleStep, validatePattern, type Pattern, type TrackId } from './domain/pattern'
import { MusicalControls, type InstrumentSettings } from './features/controls/MusicalControls'
import { PublicSessionBar } from './features/session/PublicSessionBar'
import { Sequencer } from './features/sequencer/Sequencer'
import { MusicVisualizer } from './features/visualizer/MusicVisualizer'
import { usePublicSong, type RemoteCommand } from './remote/usePublicSong'
import type { PublicSong } from './remote/song-client'
import './styles/tokens.css'
import './styles/app.css'

const generator = new DeterministicPatternGenerator()
const INITIAL_SETTINGS: InstrumentSettings = { bpm: 128, swing: 0.54, key: 'A', scale: 'minor', density: 0.72, mutation: 0.36 }

function slugFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/s\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export interface AppProps { audioEngine?: AudioEngine }

function App({ audioEngine }: AppProps) {
  const [pattern, setPattern] = useState<Pattern>(createEmptyPattern)
  const patternRef = useRef(pattern); patternRef.current = pattern
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const settingsRef = useRef(settings); settingsRef.current = settings
  const [activeStep, setActiveStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState('')
  const engineRef = useRef<AudioEngine>(audioEngine ?? new BrowserAudioEngine())
  const transportRef = useRef<LookAheadTransport | null>(null)
  if (!transportRef.current) {
    transportRef.current = new LookAheadTransport(engineRef.current, {
      onActiveStep: (step, when) => {
        const delay = Math.max(0, (when - engineRef.current.currentTime()) * 1000)
        window.setTimeout(() => setActiveStep(step), delay)
      },
    })
  }

  const stop = useCallback(() => { transportRef.current?.stop(); setPlaying(false); setActiveStep(0) }, [])
  const play = useCallback(async (startStep?: number) => {
    setAudioError('')
    try {
      await transportRef.current?.start(patternRef.current, { bpm: settingsRef.current.bpm, swing: settingsRef.current.swing })
      if (typeof startStep === 'number') transportRef.current?.seek(startStep % 16)
      setPlaying(true)
    }
    catch { setAudioError('Audio could not start. Check browser sound permissions and try Play again.'); setPlaying(false) }
  }, [])

  const receiveSnapshot = useCallback((remote: PublicSong) => {
    if (validatePattern(remote.pattern)) { setPattern(remote.pattern); transportRef.current?.setPattern(remote.pattern) }
    setSettings((current) => {
      const next = {
      ...current,
      bpm: remote.settings.bpm,
      swing: remote.settings.swing,
      key: remote.settings.key,
      scale: remote.settings.scale,
      }
      transportRef.current?.setSettings({ bpm: next.bpm, swing: next.swing })
      return next
    })
  }, [])
  const receiveCommand = useCallback((command: RemoteCommand) => {
    if (command.command === 'play') { if (typeof command.atStep === 'number') setActiveStep(command.atStep % 16); void play(command.atStep) }
    else if (command.command === 'stop') stop()
    else if (command.command === 'seek') { transportRef.current?.seek(command.atStep % 16); setActiveStep(command.atStep % 16) }
    else if (command.command === 'tempo') setSettings((current) => { const next = { ...current, bpm: command.bpm }; transportRef.current?.setSettings({ bpm: next.bpm, swing: next.swing }); return next })
  }, [play, stop])
  const slug = useMemo(() => slugFromPath(window.location.pathname), [])
  const publicSession = usePublicSong({ slug, pattern, settings, onSnapshot: receiveSnapshot, onCommand: receiveCommand })

  const generate = async (mutate = false) => {
    const next = await generator.generate({ ...settings, seed: `${Date.now()}-${mutate ? 'mutate' : 'generate'}-${Math.random()}` })
    setPattern(next); transportRef.current?.setPattern(next)
  }
  const energy = useMemo(() => ({
    drums: pattern.tracks.find((track) => track.id === 'drums')?.steps[activeStep]?.active ? 1 : 0.08,
    bass: pattern.tracks.find((track) => track.id === 'bass')?.steps[activeStep]?.active ? 0.8 : 0.05,
    melody: pattern.tracks.find((track) => track.id === 'melody')?.steps[activeStep]?.active ? 0.65 : 0.04,
  }), [activeStep, pattern])
  const handleToggle = (trackId: TrackId, step: number) => setPattern((current) => { const next = toggleStep(current, trackId, step); transportRef.current?.setPattern(next); return next })
  const updateSettings = (next: InstrumentSettings) => { setSettings(next); transportRef.current?.setSettings({ bpm: next.bpm, swing: next.swing }) }
  const arrangement = publicSession.song?.arrangement
  const bars = publicSession.song ? publicSession.song.settings.loop.endBar - publicSession.song.settings.loop.startBar : 1

  return (
    <main className="instrument-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Musiccore home">MUSIC<span>CORE</span></a>
        <div className="transport-actions">
          <button aria-label="Play" type="button" className="button button-play" aria-pressed={playing} onClick={() => void play()}>▶ <span>Play</span></button>
          <button aria-label="Stop" type="button" className="button" disabled={!playing} onClick={stop}>■ <span>Stop</span></button>
          <button aria-label="Generate loop" type="button" className="button button-generate" onClick={() => void generate()}>◇ <span>Generate loop</span></button>
          <button aria-label="Mutate" type="button" className="button button-mutate" onClick={() => void generate(true)}>⌁ <span>Mutate</span></button>
          <button aria-label="Clear" type="button" className="button" onClick={() => { stop(); setPattern((current) => { const next = clearPattern(current); transportRef.current?.setPattern(next); return next }) }}>⌫ <span>Clear</span></button>
        </div>
        <div className="meter" aria-label="Master level"><i /><i /><i /><i /></div>
      </header>

      <PublicSessionBar {...publicSession} onPublish={publicSession.publish} />
      <MusicalControls settings={settings} onChange={updateSettings} />
      {audioError ? <p className="inline-error" role="alert">{audioError}</p> : null}
      <div className="timing-strip"><span>16 STEPS</span><span>{publicSession.song?.settings.timeSignature.numerator ?? 4}/{publicSession.song?.settings.timeSignature.denominator ?? 4} TIME</span><span>1/{publicSession.song?.settings.subdivision ?? 16} NOTE</span><span>{bars} BAR LOOP</span></div>
      {arrangement?.length ? <nav className="arrangement" aria-label="Song arrangement">{arrangement.map((section) => <span key={section.id}><strong>{section.name}</strong>{section.bars} bars × {section.repeats}</span>)}</nav> : null}
      <Sequencer pattern={pattern} activeStep={activeStep} onToggle={handleToggle} />
      <MusicVisualizer activeStep={activeStep} energy={energy} />
      <footer className="status-footer">
        <span>♫</span><strong>{settings.key} {settings.scale}</strong>
        {pattern.tracks.map((track) => <span className={`track-stat track-${track.id}`} key={track.id}>{track.id} <i style={{ '--fill': `${track.steps.filter((step) => step.active).length / 16 * 100}%` } as React.CSSProperties} /></span>)}
        <span className="loop-length">Loop length <strong>{bars} bar</strong></span>
      </footer>
    </main>
  )
}

export default App

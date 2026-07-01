import { useCallback, useMemo, useRef, useState } from 'react'
import { BrowserAudioEngine } from './audio/browser-audio-engine'
import { LookAheadTransport } from './audio/transport'
import type { AudioEngine } from './audio/types'
import { DeterministicPatternGenerator } from './domain/generator'
import { clearPattern, createEmptyPattern, toggleStep, validatePattern, type Pattern, type TrackId } from './domain/pattern'
import { createArrangementTimeline, type ArrangementPosition, type ArrangementTimeline } from './domain/arrangement'
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
  const [arrangementPosition, setArrangementPosition] = useState<ArrangementPosition | null>(null)
  const timelineRef = useRef<ArrangementTimeline | null>(null)
  const playheadRef = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState('')
  const engineRef = useRef<AudioEngine>(audioEngine ?? new BrowserAudioEngine())
  const transportRef = useRef<LookAheadTransport | null>(null)
  if (!transportRef.current) {
    transportRef.current = new LookAheadTransport(engineRef.current, {
      onActiveStep: (step, when) => {
        const delay = Math.max(0, (when - engineRef.current.currentTime()) * 1000)
        window.setTimeout(() => {
          const timeline = timelineRef.current
          if (timeline) {
            const position = timeline.atStep(step)
            playheadRef.current = step
            setPattern(position.pattern)
            setActiveStep(position.visibleStep)
            setArrangementPosition(position)
          } else setActiveStep(step)
        }, delay)
      },
    })
  }

  const stop = useCallback(() => { transportRef.current?.stop(); playheadRef.current = null; setPlaying(false); setActiveStep(0); setArrangementPosition(null) }, [])
  const play = useCallback(async (startStep?: number) => {
    setAudioError('')
    try {
      const timeline = timelineRef.current
      if (timeline) {
        await transportRef.current?.startSequence({ length: timeline.totalSteps, patternAt: (step) => timeline.atStep(step).pattern }, { bpm: settingsRef.current.bpm, swing: settingsRef.current.swing })
        const songLoop = songRef.current?.settings.loop ?? { startBar: 0, endBar: timeline.totalBars }
        const loop = timeline.loopSteps(songLoop)
        transportRef.current?.setLoopRange(loop.startStep, loop.endStep)
        transportRef.current?.seek(typeof startStep === 'number' ? startStep : (playheadRef.current ?? loop.startStep))
      } else {
        await transportRef.current?.start(patternRef.current, { bpm: settingsRef.current.bpm, swing: settingsRef.current.swing })
        if (typeof startStep === 'number') transportRef.current?.seek(startStep)
      }
      setPlaying(true)
    }
    catch { setAudioError('Audio could not start. Check browser sound permissions and try Play again.'); setPlaying(false) }
  }, [])

  const songRef = useRef<PublicSong | null>(null)

  const receiveSnapshot = useCallback((remote: PublicSong) => {
    songRef.current = remote
    if (remote.arrangement.length && remote.clips.length) {
      try {
        const timeline = createArrangementTimeline(remote.clips, remote.arrangement)
        timelineRef.current = timeline
        const startStep = timeline.loopSteps(remote.settings.loop).startStep
        const position = timeline.atStep(startStep)
        playheadRef.current = startStep
        setPattern(position.pattern); setActiveStep(position.visibleStep); setArrangementPosition(position)
        transportRef.current?.setSequence({ length: timeline.totalSteps, patternAt: (step) => timeline.atStep(step).pattern })
        const loop = timeline.loopSteps(remote.settings.loop)
        transportRef.current?.setLoopRange(loop.startStep, loop.endStep)
      } catch { timelineRef.current = null }
    } else if (validatePattern(remote.pattern)) {
      timelineRef.current = null; setArrangementPosition(null); setPattern(remote.pattern); transportRef.current?.setPattern(remote.pattern)
    }
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
    if (command.command === 'play') { void play(command.atStep) }
    else if (command.command === 'stop') stop()
    else if (command.command === 'seek') {
      transportRef.current?.seek(command.atStep)
      playheadRef.current = command.atStep
      const timeline = timelineRef.current
      if (timeline) { const position = timeline.atStep(command.atStep); setPattern(position.pattern); setActiveStep(position.visibleStep); setArrangementPosition(position) }
      else setActiveStep(command.atStep)
    }
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
      {arrangement?.length ? <nav className="arrangement" aria-label="Song arrangement">{arrangement.map((section) => <span className={arrangementPosition?.section.id === section.id ? 'is-current' : undefined} key={section.id}><strong>{section.name}</strong>{section.bars} bars × {section.repeats}</span>)}</nav> : null}
      {arrangementPosition ? <p className="arrangement-progress" aria-live="polite">{arrangementPosition.section.name} · bar {arrangementPosition.sectionBar + 1}/{arrangementPosition.section.bars} · repeat {arrangementPosition.repeat + 1}/{arrangementPosition.section.repeats} · song bar {arrangementPosition.absoluteBar + 1}</p> : null}
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

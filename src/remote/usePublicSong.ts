import { useEffect, useRef, useState } from 'react'
import type { Pattern } from '../domain/pattern'
import type { InstrumentSettings } from '../features/controls/MusicalControls'
import { createSong, getSong, SongConflictError, songSocketUrl, updateSong, type PublicSong, type SongComposition } from './song-client'

export type RemoteCommand =
  | { command: 'play'; atStep?: number }
  | { command: 'stop' }
  | { command: 'seek'; atStep: number }
  | { command: 'tempo'; bpm: number }

interface Options {
  slug?: string
  pattern: Pattern
  settings: InstrumentSettings
  onSnapshot: (song: PublicSong) => void
  onCommand: (command: RemoteCommand) => void
}

export function usePublicSong({ slug: initialSlug, pattern, settings, onSnapshot, onCommand }: Options) {
  const [slug, setSlug] = useState(initialSlug)
  const [song, setSong] = useState<PublicSong | null>(null)
  const [status, setStatus] = useState(initialSlug ? 'Connecting…' : 'Local draft')
  const [error, setError] = useState('')
  const latestRevision = useRef(0)

  useEffect(() => {
    if (!slug) return
    let closed = false
    let socket: WebSocket | undefined
    getSong(slug).then((loaded) => {
      if (closed) return
      latestRevision.current = loaded.revision
      setSong(loaded); onSnapshot(loaded); setStatus('Public · live read/write')
      socket = new WebSocket(songSocketUrl(slug))
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as Record<string, unknown>
          const candidate = (message.song ?? message.snapshot ?? message) as Partial<PublicSong>
          if (candidate.pattern && typeof candidate.revision === 'number' && candidate.revision > latestRevision.current) {
            const next = { ...loaded, ...candidate } as PublicSong
            latestRevision.current = next.revision; setSong(next); onSnapshot(next)
          }
          const command = (message.type === 'control' ? message.control : message.command) as RemoteCommand | undefined
          if (command && ['play', 'stop', 'seek', 'tempo'].includes(command.command)) onCommand(command)
        } catch { /* Ignore non-protocol messages. */ }
      }
      socket.onopen = () => setStatus('Public · live read/write')
      socket.onclose = () => { if (!closed) setStatus('Public · reconnect on reload') }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load song.'))
    return () => { closed = true; socket?.close() }
  }, [slug, onCommand, onSnapshot])

  const publish = async () => {
    setError(''); setStatus('Publishing…')
    try {
      const composition: SongComposition = {
        title: song?.title ?? 'Musiccore loop', pattern,
        settings: {
          bpm: settings.bpm,
          timeSignature: song?.settings.timeSignature ?? { numerator: 4, denominator: 4 },
          subdivision: song?.settings.subdivision ?? 16,
          loop: song?.settings.loop ?? { startBar: 0, endBar: 1 },
          key: settings.key,
          scale: settings.scale,
          swing: settings.swing,
        },
        clips: song?.clips.length
          ? song.clips.map((clip) => clip.id === 'main' ? { ...clip, pattern } : clip)
          : [{ id: 'main', name: 'Main loop', pattern }],
        arrangement: song?.arrangement ?? [],
      }
      const next = song
        ? await updateSong(song.slug, { ...composition, expectedRevision: song.revision })
        : await createSong(composition)
      latestRevision.current = next.revision; setSong(next); setStatus('Public · live read/write')
      if (!slug) { history.replaceState(null, '', `/s/${next.slug}`); setSlug(next.slug) }
      return next
    } catch (reason) {
      if (reason instanceof SongConflictError) {
        latestRevision.current = reason.current.revision; setSong(reason.current); onSnapshot(reason.current)
        setError(`Revision conflict — loaded revision ${reason.current.revision}. Review and publish again.`)
      } else setError(reason instanceof Error ? reason.message : 'Publishing failed.')
      setStatus('Public write needs attention')
      return null
    }
  }

  return { song, status, error, publish }
}

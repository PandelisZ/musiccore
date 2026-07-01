import type { PublicActivity, PublicSong } from '../../remote/song-client'
import { ActivityFeed } from './ActivityFeed'

export function PublicSessionBar({ song, status, error, activity, onPublish }: { song: PublicSong | null; status: string; error: string; activity?: PublicActivity[]; onPublish: () => Promise<PublicSong | null> }) {
  const copy = async () => {
    const url = song?.publicUrl ?? (song ? `${location.origin}/s/${song.slug}` : location.href)
    await navigator.clipboard.writeText(url)
  }
  return (
    <>
    <section className="session-bar" aria-label="Public song session">
      <span className="live-dot" aria-hidden="true" />
      <span className="session-status" role="status">{status}</span>
      {song ? <span className="revision">REV {song.revision}</span> : null}
      <button type="button" className="button button-publish" onClick={() => void onPublish()}>{song ? 'Publish changes' : 'Publish'}</button>
      {song ? <button type="button" className="button button-copy" onClick={() => void copy()}>Copy URL</button> : null}
      {error ? <span className="session-error" role="alert">{error}</span> : null}
    </section>
    <ActivityFeed activity={activity} />
    </>
  )
}

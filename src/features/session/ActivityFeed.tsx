import type { PublicActivity } from '../../remote/song-client'

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function ActivityFeed({ activity = [] }: { activity?: PublicActivity[] }) {
  if (!activity.length) return null
  return (
    <section className="activity-feed" role="log" aria-label="Live public activity" aria-live="polite">
      <h2>Live activity</h2>
      <ol>
        {activity.map((item) => (
          <li key={item.id}>
            <span className={`activity-actor activity-actor-${item.actor}`}>{item.actor === 'mcp' ? 'MCP' : 'LIVE'}</span>
            <span>{item.summary}</span>
            <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
          </li>
        ))}
      </ol>
    </section>
  )
}

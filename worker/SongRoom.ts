import { DurableObject } from 'cloudflare:workers'
import type { ControlEvent, CreateSongInput, PublicActivity, PublicActivityAction, PublicActivityActor, SongSnapshot, UpdateSongInput } from './schema'

export interface Env {
  SONGS: DurableObjectNamespace<SongRoom>
  ASSETS: Fetcher
}

interface StoredSong extends Omit<SongSnapshot, 'publicUrl'> {}

interface SongRow extends Record<string, SqlStorageValue> {
  data: string
}

interface ActivityRow extends Record<string, SqlStorageValue> {
  id: number
  revision: number
  action: PublicActivityAction
  actor: PublicActivityActor
  summary: string
  created_at: string
}

const ACTIVITY_LIMIT = 100

function publicText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

function controlSummary(control: ControlEvent): string {
  if (control.command === 'play') return 'Started playback'
  if (control.command === 'stop') return 'Stopped playback'
  if (control.command === 'seek') return `Moved playback to step ${control.atStep}`
  return `Changed tempo to ${control.bpm} BPM`
}

export class SongRoom extends DurableObject<Env> {
  private controlWindowStartedAt = 0
  private controlsInWindow = 0
  private lastControlSignature = ''
  private lastControlAt = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS song (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision INTEGER NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'human',
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    const columns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(activity)').toArray()
    if (!columns.some(({ name }) => name === 'actor')) {
      this.ctx.storage.sql.exec("ALTER TABLE activity ADD COLUMN actor TEXT NOT NULL DEFAULT 'human'")
    }
  }

  private stored(): StoredSong | null {
    const row = this.ctx.storage.sql.exec<SongRow>('SELECT data FROM song WHERE id = 1').toArray()[0]
    return row ? JSON.parse(row.data) as StoredSong : null
  }

  private activity(limit = ACTIVITY_LIMIT): PublicActivity[] {
    const bounded = Math.max(1, Math.min(ACTIVITY_LIMIT, Math.trunc(limit) || ACTIVITY_LIMIT))
    return this.ctx.storage.sql.exec<ActivityRow>(
      'SELECT id, revision, action, actor, summary, created_at FROM activity ORDER BY id DESC LIMIT ?', bounded,
    ).toArray().reverse().map((row) => ({
      id: row.id, revision: row.revision, action: row.action, actor: row.actor,
      summary: row.summary, createdAt: row.created_at,
    }))
  }

  private snapshot(origin: string): SongSnapshot | null {
    const song = this.stored()
    return song ? { ...song, publicUrl: `${origin}/s/${song.slug}` } : null
  }

  private broadcast(payload: unknown): void {
    const message = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message) } catch { socket.close(1011, 'Broadcast failed') }
    }
  }

  private record(revision: number, action: PublicActivityAction, actor: PublicActivityActor, summary: string, createdAt: string): PublicActivity {
    this.ctx.storage.sql.exec(
      'INSERT INTO activity (revision, action, actor, summary, created_at) VALUES (?, ?, ?, ?, ?)',
      revision, action, actor, publicText(summary), createdAt,
    )
    this.ctx.storage.sql.exec('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)', ACTIVITY_LIMIT)
    return this.activity(1)[0]!
  }

  private persist(song: StoredSong, action: 'created' | 'updated', actor: PublicActivityActor, summary: string): PublicActivity {
    let activity!: PublicActivity
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO song (id, data) VALUES (1, ?)', JSON.stringify(song))
      activity = this.record(song.revision, action, actor, summary, song.updatedAt)
    })
    return activity
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('x-public-origin') ?? url.origin
    const actor: PublicActivityActor = request.headers.get('x-musiccore-actor') === 'mcp' ? 'mcp' : 'human'
    if (url.pathname === '/song' && request.method === 'GET') {
      const song = this.snapshot(origin)
      return song ? Response.json(song) : Response.json({ error: 'not_found' }, { status: 404 })
    }
    if (url.pathname === '/song' && request.method === 'POST') {
      if (this.stored()) return Response.json({ error: 'already_exists' }, { status: 409 })
      const { slug, input } = await request.json<{ slug: string; input: CreateSongInput }>()
      const now = new Date().toISOString()
      const stored: StoredSong = { slug, ...input, revision: 1, createdAt: now, updatedAt: now }
      const activity = this.persist(stored, 'created', actor, `Created “${stored.title}”`)
      const song = this.snapshot(origin)!
      this.broadcast({ type: 'snapshot', song, activity, activities: this.activity() })
      return Response.json(song, { status: 201 })
    }
    if (url.pathname === '/song' && request.method === 'PUT') {
      const current = this.stored()
      if (!current) return Response.json({ error: 'not_found' }, { status: 404 })
      const input = await request.json<UpdateSongInput>()
      if (input.expectedRevision !== current.revision) {
        return Response.json({ error: 'revision_conflict', currentRevision: current.revision }, { status: 409 })
      }
      const { expectedRevision: _, ...composition } = input
      void _
      const stored: StoredSong = { ...current, ...composition, revision: current.revision + 1, updatedAt: new Date().toISOString() }
      const activity = this.persist(stored, 'updated', actor, `Updated “${stored.title}” to revision ${stored.revision}`)
      const song = this.snapshot(origin)!
      this.broadcast({ type: 'snapshot', song, activity, activities: this.activity() })
      return Response.json(song)
    }
    if (url.pathname === '/activity' && request.method === 'GET') {
      if (!this.stored()) return Response.json({ error: 'not_found' }, { status: 404 })
      return Response.json({ activity: this.activity(Number(url.searchParams.get('limit') ?? ACTIVITY_LIMIT)) })
    }
    if (url.pathname === '/activity' && request.method === 'POST' && actor === 'mcp') {
      const current = this.stored()
      if (!current) return Response.json({ error: 'not_found' }, { status: 404 })
      const { summary } = await request.json<{ summary: string }>()
      const activity = this.record(current.revision, 'mcp', 'mcp', summary, new Date().toISOString())
      this.broadcast({ type: 'activity', activity, activities: this.activity() })
      return Response.json({ ok: true, activity })
    }
    if (url.pathname === '/control' && request.method === 'POST') {
      const current = this.stored()
      if (!current) return Response.json({ error: 'not_found' }, { status: 404 })
      const control = await request.json<ControlEvent>()
      const now = Date.now()
      if (now - this.controlWindowStartedAt >= 1_000) {
        this.controlWindowStartedAt = now
        this.controlsInWindow = 0
      }
      this.controlsInWindow += 1
      if (this.controlsInWindow > 20) {
        return Response.json({ error: 'rate_limited', retryAfterMs: Math.max(1, 1_000 - (now - this.controlWindowStartedAt)) }, {
          status: 429, headers: { 'retry-after': '1' },
        })
      }
      const signature = JSON.stringify(control)
      if (signature === this.lastControlSignature && now - this.lastControlAt < 50) {
        return Response.json({ ok: true, control, coalesced: true }, { status: 202 })
      }
      this.lastControlSignature = signature
      this.lastControlAt = now
      const sentAt = new Date().toISOString()
      const activity = this.record(current.revision, 'control', actor, controlSummary(control), sentAt)
      this.broadcast({ type: 'control', control, sentAt, activity, activities: this.activity() })
      return Response.json({ ok: true, control })
    }
    if (url.pathname === '/websocket' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const song = this.snapshot(origin)
      if (!song) return Response.json({ error: 'not_found' }, { status: 404 })
      if (this.ctx.getWebSockets().length >= 64) {
        return Response.json({ error: 'viewer_limit_reached' }, { status: 429, headers: { 'retry-after': '10' } })
      }
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.serializeAttachment({ connectedAt: new Date().toISOString() })
      this.ctx.acceptWebSocket(server)
      server.send(JSON.stringify({ type: 'snapshot', song, activity: this.activity() }))
      return new Response(null, { status: 101, webSocket: client })
    }
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || message.length > 4096) {
      socket.close(1009, 'Messages are read-only and bounded')
      return
    }
    socket.send(JSON.stringify({ type: 'error', error: 'read_only_socket' }))
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason)
  }
}

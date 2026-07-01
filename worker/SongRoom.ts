import { DurableObject } from 'cloudflare:workers'
import type { ControlEvent, CreateSongInput, SongSnapshot, UpdateSongInput } from './schema'

export interface Env {
  SONGS: DurableObjectNamespace<SongRoom>
  ASSETS: Fetcher
}

interface StoredSong extends Omit<SongSnapshot, 'publicUrl'> {}

interface SongRow extends Record<string, SqlStorageValue> {
  data: string
}

export class SongRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS song (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision INTEGER NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
  }

  private stored(): StoredSong | null {
    const row = this.ctx.storage.sql.exec<SongRow>('SELECT data FROM song WHERE id = 1').toArray()[0]
    return row ? JSON.parse(row.data) as StoredSong : null
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

  private persist(song: StoredSong, action: 'created' | 'updated', summary: string): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO song (id, data) VALUES (1, ?)', JSON.stringify(song))
      this.ctx.storage.sql.exec(
        'INSERT INTO activity (revision, action, summary, created_at) VALUES (?, ?, ?, ?)',
        song.revision, action, summary.slice(0, 160), song.updatedAt,
      )
      this.ctx.storage.sql.exec('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 100)')
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('x-public-origin') ?? url.origin
    if (url.pathname === '/song' && request.method === 'GET') {
      const song = this.snapshot(origin)
      return song ? Response.json(song) : Response.json({ error: 'not_found' }, { status: 404 })
    }
    if (url.pathname === '/song' && request.method === 'POST') {
      if (this.stored()) return Response.json({ error: 'already_exists' }, { status: 409 })
      const { slug, input } = await request.json<{ slug: string; input: CreateSongInput }>()
      const now = new Date().toISOString()
      const stored: StoredSong = { slug, ...input, revision: 1, createdAt: now, updatedAt: now }
      this.persist(stored, 'created', `Created “${stored.title}”`)
      const song = this.snapshot(origin)!
      this.broadcast({ type: 'snapshot', song, activity: { action: 'created', summary: `Created “${stored.title}”` } })
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
      this.persist(stored, 'updated', `Updated “${stored.title}” to revision ${stored.revision}`)
      const song = this.snapshot(origin)!
      this.broadcast({ type: 'snapshot', song, activity: { action: 'updated', summary: `Updated “${stored.title}”`, revision: stored.revision } })
      return Response.json(song)
    }
    if (url.pathname === '/control' && request.method === 'POST') {
      if (!this.stored()) return Response.json({ error: 'not_found' }, { status: 404 })
      const control = await request.json<ControlEvent>()
      this.broadcast({ type: 'control', control, sentAt: new Date().toISOString() })
      return Response.json({ ok: true, control })
    }
    if (url.pathname === '/websocket' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const song = this.snapshot(origin)
      if (!song) return Response.json({ error: 'not_found' }, { status: 404 })
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.serializeAttachment({ connectedAt: new Date().toISOString() })
      this.ctx.acceptWebSocket(server)
      server.send(JSON.stringify({ type: 'snapshot', song }))
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

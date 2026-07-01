import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { testPattern, testSongInput } from './test-helpers'
import { boundedRequest, parseJson } from './index'

const origin = 'https://musiccore.test'

describe('public song rooms', () => {
  it('bounds bodies even when Content-Length is absent', async () => {
    const request = new Request(`${origin}/api/songs`, { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(200_001) }) })
    expect(request.headers.get('content-length')).toBeNull()
    await expect(parseJson(request)).rejects.toThrow('payload_too_large')
  })

  it('returns 413 before MCP parsing when Content-Length is absent or lies', async () => {
    for (const headers of [
      new Headers({ 'content-type': 'application/json' }),
      new Headers({ 'content-type': 'application/json', 'content-length': '1' }),
    ]) {
      const response = await SELF.fetch(`${origin}/mcp`, {
        method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(200_001) }),
      })
      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ error: 'payload_too_large' })
    }
  })

  it('stops reading an undeclared streaming body once it crosses the cap', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(150_000))
        controller.enqueue(new Uint8Array(60_000))
        controller.enqueue(new Uint8Array(150_000))
      },
      cancel() { cancelled = true },
    })
    const result = await boundedRequest(new Request(`${origin}/mcp`, { method: 'POST', body }))
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(413)
    expect(cancelled).toBe(true)
  })
  it('creates, reads, and updates a song with optimistic revisions', async () => {
    const createdResponse = await SELF.fetch(`${origin}/api/songs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(testSongInput()),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json<Record<string, any>>()
    expect(created.slug).toMatch(/^[a-z0-9_-]{20,}$/)
    expect(created.revision).toBe(1)

    const readResponse = await SELF.fetch(`${origin}/api/songs/${created.slug}`)
    expect(readResponse.status).toBe(200)
    expect(await readResponse.json()).toEqual(created)

    const updatedPattern = testPattern(48)
    const updatedInput = testSongInput(48)
    const updatedResponse = await SELF.fetch(`${origin}/api/songs/${created.slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...updatedInput, expectedRevision: 1, title: 'Second light', pattern: updatedPattern, settings: { ...updatedInput.settings, bpm: 96 } }),
    })
    expect(updatedResponse.status).toBe(200)
    const updated = await updatedResponse.json<Record<string, any>>()
    expect(updated.revision).toBe(2)
    expect(updated.pattern).toEqual(updatedPattern)

    const conflict = await SELF.fetch(`${origin}/api/songs/${created.slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...testSongInput(), expectedRevision: 1, title: 'Stale' }),
    })
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ error: 'revision_conflict', currentRevision: 2 })
  })

  it('rejects malformed and oversized public writes', async () => {
    const response = await SELF.fetch(`${origin}/api/songs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...testSongInput(), title: 'x'.repeat(129), pattern: {} }),
    })
    expect(response.status).toBe(400)

    const oversized = await SELF.fetch(`${origin}/api/songs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...testSongInput(), padding: 'x'.repeat(200_001) }),
    })
    expect(await oversized.json()).toMatchObject({ error: 'payload_too_large' })
  })

  it('persists canonical settings, reusable clips, and ordered arrangement', async () => {
    const input = testSongInput()
    const response = await SELF.fetch(`${origin}/api/songs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      settings: input.settings,
      clips: input.clips,
      arrangement: input.arrangement,
      revision: 1,
    })
  })

  it('returns MIDI beginning with MThd', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...testSongInput(), title: 'MIDI room' }),
      })
    ).json<Record<string, any>>()

    const response = await SELF.fetch(`${origin}/api/songs/${created.slug}/midi`)
    expect(response.headers.get('content-type')).toContain('audio/midi')
    expect(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 4))).toBe('MThd')
  })

  it('sends a snapshot and broadcasts persisted updates to two WebSockets', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...testSongInput(), title: 'Live room' }),
      })
    ).json<Record<string, any>>()

    const nextMessage = (socket: WebSocket) => new Promise<MessageEvent>((resolve) => socket.addEventListener('message', resolve, { once: true }))
    const connect = async () => {
      const response = await SELF.fetch(`${origin}/ws/${created.slug}`, {
        headers: { Upgrade: 'websocket' },
      })
      expect(response.status).toBe(101)
      const socket = response.webSocket!
      const snapshot = nextMessage(socket)
      socket.accept()
      return { socket, snapshot }
    }
    const firstConnection = await connect()
    const secondConnection = await connect()
    const { socket: first } = firstConnection
    const { socket: second } = secondConnection
    expect(JSON.parse((await firstConnection.snapshot).data as string)).toMatchObject({ type: 'snapshot', song: { revision: 1 } })
    expect(JSON.parse((await secondConnection.snapshot).data as string)).toMatchObject({ type: 'snapshot', song: { revision: 1 } })

    const broadcast = nextMessage(second)
    const update = await SELF.fetch(`${origin}/api/songs/${created.slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...testSongInput(52), expectedRevision: 1, title: 'Live edit' }),
    })
    expect(update.status).toBe(200)
    expect(JSON.parse((await broadcast).data as string)).toMatchObject({
      type: 'snapshot',
      song: { revision: 2, title: 'Live edit' },
      activity: { action: 'updated' },
    })
    first.close(1000, 'done')
    second.close(1000, 'done')
  })

  it('broadcasts public playback controls without changing the song revision', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(testSongInput()),
      })
    ).json<Record<string, any>>()
    const response = await SELF.fetch(`${origin}/ws/${created.slug}`, { headers: { Upgrade: 'websocket' } })
    const socket = response.webSocket!
    const event = new Promise<MessageEvent>((resolve) => {
      let count = 0
      socket.addEventListener('message', (message) => { if (++count === 2) resolve(message) })
    })
    socket.accept()
    const controlResponse = await SELF.fetch(`${origin}/api/songs/${created.slug}/control`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'seek', atStep: 12 }),
    })
    expect(controlResponse.status).toBe(200)
    expect(JSON.parse((await event).data as string)).toMatchObject({ type: 'control', control: { command: 'seek', atStep: 12 } })
    expect(await (await SELF.fetch(`${origin}/api/songs/${created.slug}`)).json()).toMatchObject({ revision: 1 })
    socket.close(1000, 'done')
  })

  it('rate limits control floods per room', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(testSongInput()),
      })
    ).json<Record<string, any>>()
    const statuses: number[] = []
    for (let index = 0; index < 30; index += 1) {
      statuses.push((await SELF.fetch(`${origin}/api/songs/${created.slug}/control`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'seek', atStep: index }),
      })).status)
    }
    expect(statuses).toContain(429)
  })

  it('caps WebSocket viewers per room', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(testSongInput()),
      })
    ).json<Record<string, any>>()
    const sockets: WebSocket[] = []
    for (let index = 0; index < 64; index += 1) {
      const response = await SELF.fetch(`${origin}/ws/${created.slug}`, { headers: { Upgrade: 'websocket' } })
      expect(response.status).toBe(101)
      response.webSocket!.accept()
      sockets.push(response.webSocket!)
    }
    const rejected = await SELF.fetch(`${origin}/ws/${created.slug}`, { headers: { Upgrade: 'websocket' } })
    expect(rejected.status).toBe(429)
    sockets.forEach((socket) => socket.close(1000, 'done'))
  })

  it('exposes bounded public activity and includes it in WebSocket snapshots', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...testSongInput(), title: '<script>private</script>' }),
      })
    ).json<Record<string, any>>()
    await SELF.fetch(`${origin}/api/songs/${created.slug}/control`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'play', atStep: 0 }),
    })

    const historyResponse = await SELF.fetch(`${origin}/api/songs/${created.slug}/activity?limit=1`)
    expect(historyResponse.status).toBe(200)
    const history = await historyResponse.json<Record<string, any>>()
    expect(history.activity).toHaveLength(1)
    expect(history.activity[0]).toMatchObject({ action: 'control', actor: 'human', summary: 'Started playback', revision: 1 })
    expect(history.activity[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(JSON.stringify(history)).not.toContain('<script>')

    const response = await SELF.fetch(`${origin}/ws/${created.slug}`, { headers: { Upgrade: 'websocket' } })
    const socket = response.webSocket!
    const snapshot = new Promise<MessageEvent>((resolve) => socket.addEventListener('message', resolve, { once: true }))
    socket.accept()
    expect(JSON.parse((await snapshot).data as string)).toMatchObject({
      type: 'snapshot',
      activity: [{ action: 'created' }, { action: 'control', actor: 'human', summary: 'Started playback' }],
    })
    socket.close(1000, 'done')
  })

  it('marks MCP writes as public MCP activity without exposing request arguments', async () => {
    const created = await (
      await SELF.fetch(`${origin}/api/songs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-musiccore-actor': 'mcp' },
        body: JSON.stringify({ ...testSongInput(), title: 'Agent loop' }),
      })
    ).json<Record<string, any>>()
    const history = await (await SELF.fetch(`${origin}/api/songs/${created.slug}/activity`)).json<Record<string, any>>()
    expect(history.activity[0]).toMatchObject({ action: 'created', actor: 'mcp', summary: 'Created “Agent loop”' })
    expect(history.activity[0]).not.toHaveProperty('arguments')
    expect(history.activity[0]).not.toHaveProperty('prompt')
  })
})

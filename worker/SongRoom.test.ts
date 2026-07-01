import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { testPattern, testSongInput } from './test-helpers'

const origin = 'https://musiccore.test'

describe('public song rooms', () => {
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
})

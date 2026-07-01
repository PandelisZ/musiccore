import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { testSongInput } from './test-helpers'

async function mcp(method: string, params?: unknown) {
  const response = await SELF.fetch('https://musiccore.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, ...(params ? { params } : {}) }),
  })
  expect(response.status).toBe(200)
  return response.json<Record<string, any>>()
}

function toolText(response: Record<string, any>) {
  return JSON.parse(response.result.content[0].text)
}

describe('public stateless MCP', () => {
  it('initializes and lists complete composition, analysis, and playback tools', async () => {
    const initialized = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(initialized.result.serverInfo.name).toBe('musiccore')
    const listed = await mcp('tools/list')
    expect(listed.result.tools.map((tool: any) => tool.name)).toEqual(expect.arrayContaining([
      'create_song', 'get_song', 'update_song', 'mutate_song', 'publish_song', 'analyze_song', 'control_playback',
    ]))
  })

  it('creates, reads, updates, analyzes, controls, and publishes a full arranged song', async () => {
    const input = testSongInput()
    const created = toolText(await mcp('tools/call', { name: 'create_song', arguments: input }))
    expect(created).toMatchObject({ revision: 1, settings: input.settings, arrangement: input.arrangement })
    expect(created.publicUrl).toBe(`https://musiccore.test/s/${created.slug}`)

    const read = toolText(await mcp('tools/call', { name: 'get_song', arguments: { slug: created.slug } }))
    expect(read).toMatchObject({ slug: created.slug, revision: 1 })

    const updated = toolText(await mcp('tools/call', {
      name: 'update_song', arguments: { slug: created.slug, expectedRevision: 1, ...input, title: 'MCP revision' },
    }))
    expect(updated).toMatchObject({ title: 'MCP revision', revision: 2 })

    const analysis = toolText(await mcp('tools/call', { name: 'analyze_song', arguments: { slug: created.slug } }))
    expect(analysis).toMatchObject({ totalBars: 10, asciiWaveform: expect.any(String) })

    expect(toolText(await mcp('tools/call', { name: 'control_playback', arguments: { slug: created.slug, command: 'play', atStep: 0 } }))).toMatchObject({ ok: true })
    expect(toolText(await mcp('tools/call', { name: 'publish_song', arguments: { slug: created.slug } }))).toMatchObject({ publicUrl: created.publicUrl })
  })
})

# Musiccore

Musiccore is a browser sequencer and a public, collaborative music API on Cloudflare Workers. Each song has an unguessable URL, a SQLite-backed Durable Object, hibernating WebSocket viewers, MIDI export, and a stateless Streamable HTTP MCP endpoint for Codex and other MCP clients.

## Develop and verify

```sh
npm install
npm run dev
npm test
npm run test:worker
npm run typecheck:worker
npm run lint
npm run build
```

Run the complete Worker locally with `npx wrangler dev`. Deploy static assets, the Worker, and the `SongRoom` migration together with:

```sh
npx wrangler whoami
npm run deploy
```

## Public song API

- `POST /api/songs` creates a room and returns revision `1` plus `/s/:slug`.
- `GET /api/songs/:slug` reads the canonical song.
- `PUT /api/songs/:slug` replaces it when `expectedRevision` matches; stale writes return `409` and `currentRevision`.
- `POST /api/songs/:slug/control` broadcasts bounded `play`, `stop`, `seek`, or `tempo` events. Browsers render audio locally.
- `GET /api/songs/:slug/midi` exports the complete ordered arrangement using its canonical tempo and note velocities.
- `GET /ws/:slug` upgrades to a hibernating WebSocket, sends the current snapshot, and broadcasts persisted revisions and public control events.

The strict song model includes tempo, meter, subdivision, loop range, key, scale, swing, integer MIDI notes `0..127`, velocities, reusable clips, and ordered/repeated long-form sections. Writes and activity history are size-bounded. No private model reasoning or chain-of-thought is stored or broadcast.

## Authless MCP for Codex

Connect an MCP client to `https://<worker>/mcp` using the Streamable HTTP transport. A fresh server and handler are created for each request. Available tools:

- `create_song`, `get_song`, `update_song`, `mutate_song`, and `publish_song`
- `analyze_song` for onset grids, per-track density, pitch range/contour, syncopation, repetition, energy by bar, and an ASCII waveform
- `control_playback` for public play/stop/seek/tempo broadcasts

All songs and tools are intentionally public and authless. URLs are high entropy but are not an authorization boundary. Do not submit secrets or private reasoning. Production abuse controls should be applied at the Cloudflare zone/account layer.

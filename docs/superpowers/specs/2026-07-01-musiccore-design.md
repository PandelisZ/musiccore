# Musiccore Design

## Product goal

Musiccore is a playful browser-based music generator. Its first release lets a user generate, edit, hear, visualize, and publicly publish a looping multi-track pattern without accounts or external devices.

## First-release scope

- React and Vite single-page application.
- Sixteen-step loop with drum, bass, and melody tracks.
- Browser-native synthesized playback using the Web Audio API.
- Controls for play/stop, tempo, swing, key, scale, density, mutation, randomize, and clear.
- Direct step editing so generated patterns remain playable and understandable.
- Animated visualization synchronized to the current step and audio energy.
- Responsive, keyboard-accessible interface for desktop and mobile browsers.
- Seeded generation where practical so generator behavior can be tested deterministically.

Not included in this release: hardware MIDI devices, authentication, private songs, or direct model API calls from the browser.

## Public publishing and Codex integration

Every composition can be published to an unguessable public slug at `/s/:slug`. Songs are deliberately authless and public read/write: the browser and Codex can create, inspect, replace, and mutate the same pattern. Updates use optimistic revision checks so concurrent writers receive a conflict instead of silently overwriting each other.

The Cloudflare Worker exposes a Streamable HTTP MCP endpoint at `/mcp`. A fresh stateless MCP server is created for each request and provides `create_song`, `get_song`, `update_song`, `mutate_song`, and `publish_song` tools. Tools return the canonical song, revision, and public URL. Server instructions tell Codex how to create a song, make bounded edits, handle revision conflicts, and publish the resulting URL. No private reasoning or chain-of-thought is stored or broadcast; live activity contains only public tool/action summaries and music state.

A Standard MIDI file response at `/api/songs/:slug/midi` serializes the same canonical note pattern. Browser playback remains synthesized locally and does not require MIDI hardware.

## Experience

The sequencer is the primary surface rather than a marketing page. Transport and musical controls remain visible, the three tracks share a clear sixteen-step time axis, and generation provides an immediate playable result. Playback highlights the active step while a lightweight waveform or particle field responds to timing and track energy. Motion respects `prefers-reduced-motion`.

The visual direction should feel like a compact digital instrument: vivid, playful, and legible, without generic dashboard card grids or decorative controls that do not affect sound.

## Architecture

- `audio`: scheduling, transport timing, and small synthesizer voices behind an audio-engine interface.
- `sequencer`: pattern types, immutable editing operations, timing math, and playback state.
- `generator`: rule-based drum, bass, and melody generation behind a provider interface.
- `visualization`: derives render data from transport position and audio activity; it does not own playback state.
- `features`: focused React components for transport, musical parameters, track rows, and generation actions.
- `app`: composes the instrument and owns top-level state. It should not accumulate audio or generation internals.
- `worker`: routes public song APIs, WebSockets, MCP, MIDI serialization, and static assets.
- `SongRoom`: one SQLite-backed Durable Object per song slug; owns canonical song state, monotonically increasing revision, bounded public activity events, and WebSocket broadcast.

The local generator and MCP tools return the same validated pattern structure, allowing Codex to compose by calling tools without coupling model calls to the UI or audio scheduler.

The Worker serves the Vite `dist` directory using Workers Static Assets. `/api/*`, `/mcp`, and `/ws/*` run Worker-first. Durable Object WebSockets use hibernation; persistent song state never relies on in-memory fields surviving a wake. Public writes accept only strict, size-bounded schemas and high-entropy slugs.

## Data flow

User controls update sequencer settings or pattern state. The transport schedules upcoming steps through the audio engine using a short look-ahead window. Each scheduled step triggers the appropriate voice and publishes timing/activity data for UI highlighting and visualization. Generation requests pass musical settings to the active generator provider; returned patterns are validated before replacing current state.

Publishing creates or updates a `SongRoom`, then returns its public URL. A browser on `/s/:slug` loads the latest snapshot and opens `/ws/:slug`. Browser or MCP writes include `expectedRevision`; accepted writes persist first, increment the revision, and broadcast the canonical snapshot plus a public activity summary to all connected viewers.

## Failure handling

Audio starts only after a user gesture and reports an actionable inline error if the browser cannot create or resume an audio context. Invalid generator output is rejected without destroying the current pattern. Unsupported optional browser features must not prevent editing or generation.

Public API and MCP payloads are schema-validated and bounded. Missing songs return 404, stale writes return 409 with the current revision, and malformed patterns return 400. WebSocket reconnect performs a fresh snapshot read. Authless access is intentional; rate limiting and unguessable slugs reduce accidental abuse but do not imply privacy.

## Verification

- Unit tests cover timing, pattern editing, validation, and deterministic generation.
- Component tests cover transport and sequencer interactions.
- A production build and lint/type checks must pass.
- Live-browser end-to-end testing must verify initial generation, step editing, play/stop, tempo changes, active-step movement, visualization response, randomization, clear, responsive layout, and absence of console errors.
- Browser testing must confirm that audible playback is initiated through a real user gesture; automated assertions may inspect audio-engine state where audio capture is unavailable.
- Worker integration tests verify create/read/update/conflict, Durable Object persistence, WebSocket fan-out, MCP tool calls, and MIDI serialization.
- Deployed end-to-end testing opens the same unique song URL in two browser pages, writes from one client or MCP, verifies live update in the other, reloads to prove persistence, and connects Codex to the public MCP endpoint.

## Delivery constraints

Implementation work can be split among parallel agents by stable module boundaries, but integration remains a single coherent SPA. Source files approaching 500 lines should be split by responsibility without excessive fragmentation.

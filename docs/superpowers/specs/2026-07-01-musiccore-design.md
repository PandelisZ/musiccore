# Musiccore Design

## Product goal

Musiccore is a playful browser-based music generator. Its first release lets a user generate, edit, hear, and visualize a looping multi-track pattern without accounts, external devices, uploads, or downloads.

## First-release scope

- React and Vite single-page application.
- Sixteen-step loop with drum, bass, and melody tracks.
- Browser-native synthesized playback using the Web Audio API.
- Controls for play/stop, tempo, swing, key, scale, density, mutation, randomize, and clear.
- Direct step editing so generated patterns remain playable and understandable.
- Animated visualization synchronized to the current step and audio energy.
- Responsive, keyboard-accessible interface for desktop and mobile browsers.
- Seeded generation where practical so generator behavior can be tested deterministically.

Not included in this release: MIDI devices, MIDI file export, authentication, persistence, server infrastructure, model API calls, or a production MCP server.

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

The generator provider boundary is the future integration point for Codex skills or MCP-backed AI. A future provider must return the same validated pattern structure as the local generator, allowing AI generation to be added without coupling model calls to the UI or audio scheduler.

## Data flow

User controls update sequencer settings or pattern state. The transport schedules upcoming steps through the audio engine using a short look-ahead window. Each scheduled step triggers the appropriate voice and publishes timing/activity data for UI highlighting and visualization. Generation requests pass musical settings to the active generator provider; returned patterns are validated before replacing current state.

## Failure handling

Audio starts only after a user gesture and reports an actionable inline error if the browser cannot create or resume an audio context. Invalid generator output is rejected without destroying the current pattern. Unsupported optional browser features must not prevent editing or generation.

## Verification

- Unit tests cover timing, pattern editing, validation, and deterministic generation.
- Component tests cover transport and sequencer interactions.
- A production build and lint/type checks must pass.
- Live-browser end-to-end testing must verify initial generation, step editing, play/stop, tempo changes, active-step movement, visualization response, randomization, clear, responsive layout, and absence of console errors.
- Browser testing must confirm that audible playback is initiated through a real user gesture; automated assertions may inspect audio-engine state where audio capture is unavailable.

## Delivery constraints

Implementation work can be split among parallel agents by stable module boundaries, but integration remains a single coherent SPA. Source files approaching 500 lines should be split by responsibility without excessive fragmentation.

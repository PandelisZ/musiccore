# Musiccore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and live-browser-verify a playful React/Vite step-sequenced music generator with synthesized playback and synchronized visualization.

**Architecture:** A typed pattern domain feeds an isolated rule generator and a Web Audio transport. React owns editable application state, while playback and visualization consume stable interfaces rather than embedding timing logic in components.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Web Audio API, Canvas 2D, Playwright for end-to-end fallback.

---

## File structure

- `src/domain/pattern.ts`: musical types, defaults, edits, and validation.
- `src/generator/localGenerator.ts`: deterministic rule-based generation.
- `src/audio/AudioEngine.ts`: browser audio-context lifecycle and voice scheduling.
- `src/audio/Transport.ts`: look-ahead step scheduling.
- `src/features/sequencer/*`: track grid and step controls.
- `src/features/controls/*`: transport and generator parameters.
- `src/features/visualizer/*`: synchronized Canvas visualization.
- `src/App.tsx`: composition and top-level state only.
- `src/styles/*`: tokens, layout, components, and responsive rules.
- `src/**/*.test.ts(x)`: unit/component tests beside their owners.
- `e2e/musiccore.spec.ts`: core browser workflow.

### Task 1: Scaffold and domain model

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`
- Create: `src/domain/pattern.ts`, `src/domain/pattern.test.ts`

- [ ] **Step 1: Scaffold Vite React TypeScript and install test dependencies**

Run: `npm create vite@latest . -- --template react-ts && npm install && npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`

Expected: dependencies install and `npm run build` succeeds.

- [ ] **Step 2: Write failing domain tests**

```ts
import { describe, expect, it } from 'vitest'
import { createEmptyPattern, toggleStep, validatePattern } from './pattern'

describe('pattern', () => {
  it('creates three tracks with sixteen silent steps', () => {
    const pattern = createEmptyPattern()
    expect(pattern.tracks.map((track) => track.steps.length)).toEqual([16, 16, 16])
    expect(pattern.tracks.flatMap((track) => track.steps).every((step) => !step.active)).toBe(true)
  })
  it('toggles one step without mutating the input', () => {
    const original = createEmptyPattern()
    const next = toggleStep(original, 'drums', 0)
    expect(next.tracks[0].steps[0].active).toBe(true)
    expect(original.tracks[0].steps[0].active).toBe(false)
  })
  it('rejects patterns without exactly sixteen steps per track', () => {
    const invalid = structuredClone(createEmptyPattern())
    invalid.tracks[0].steps.pop()
    expect(validatePattern(invalid)).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test and confirm missing-module failure**

Run: `npx vitest run src/domain/pattern.test.ts`
Expected: FAIL because `pattern.ts` does not exist.

- [ ] **Step 4: Implement typed pattern operations**

Define `TrackId = 'drums' | 'bass' | 'melody'`, `Step { active, velocity, note? }`, `Track`, `Pattern`, `createEmptyPattern()`, immutable `toggleStep()`, `clearPattern()`, and a structural `validatePattern()` requiring each track once and sixteen valid steps.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/domain/pattern.test.ts && npm run build`
Expected: all tests and build PASS.

Commit: `git commit -am 'feat: scaffold musiccore pattern domain'`

### Task 2: Deterministic local generator

**Files:**
- Create: `src/generator/types.ts`, `src/generator/localGenerator.ts`, `src/generator/localGenerator.test.ts`

- [ ] **Step 1: Write failing generator tests**

```ts
it('returns a valid repeatable pattern for a seed', () => {
  const settings = { seed: 42, key: 'C', scale: 'minor', density: 0.6, mutation: 0.2 }
  expect(generatePattern(settings)).toEqual(generatePattern(settings))
  expect(validatePattern(generatePattern(settings))).toBe(true)
})
it('always gives drums a downbeat', () => {
  expect(generatePattern({ seed: 1, key: 'C', scale: 'major', density: 0, mutation: 0 }).tracks[0].steps[0].active).toBe(true)
})
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/generator/localGenerator.test.ts`
Expected: FAIL because generator modules do not exist.

- [ ] **Step 3: Implement provider boundary and seeded generator**

Define `GeneratorSettings`, `PatternGenerator { generate(settings): Promise<Pattern> }`, a small seeded PRNG, scale-note selection, four-on-floor-informed drums, root/fifth bass, and scale melody. Export synchronous `generatePattern` plus `localGenerator` provider.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/generator src/domain`
Expected: PASS.

Commit: `git add src/generator && git commit -m 'feat: add deterministic loop generator'`

### Task 3: Audio engine and transport

**Files:**
- Create: `src/audio/types.ts`, `src/audio/AudioEngine.ts`, `src/audio/Transport.ts`
- Create: `src/audio/Transport.test.ts`

- [ ] **Step 1: Write failing timing tests with a fake engine**

```ts
it('calculates a sixteenth-note duration from bpm', () => {
  expect(stepDurationSeconds(120)).toBe(0.125)
})
it('delays odd steps when swing is applied', () => {
  expect(stepTime(1, 0, 120, 0.5)).toBeGreaterThan(stepDurationSeconds(120))
})
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/audio/Transport.test.ts`
Expected: FAIL because timing exports do not exist.

- [ ] **Step 3: Implement audio lifecycle, voices, and scheduling**

Create an `AudioEngine` with explicit `start()`, `stopAll()`, `schedule(track, step, time)`, and `currentTime`. Use oscillator/gain nodes for bass and melody and filtered noise/oscillators for drum voices. Implement a 25ms scheduler interval with a 100ms look-ahead, active-step callback, BPM and swing inputs, and complete timer/node cleanup.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/audio src/domain && npm run build`
Expected: PASS.

Commit: `git add src/audio && git commit -m 'feat: add web audio transport and voices'`

### Task 4: Sequencer controls and interaction

**Files:**
- Create: `src/features/sequencer/Sequencer.tsx`, `TrackRow.tsx`, `StepButton.tsx`, `Sequencer.test.tsx`
- Create: `src/features/controls/TransportControls.tsx`, `GeneratorControls.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing interaction test**

```tsx
it('generates, toggles, clears, and starts playback', async () => {
  render(<App audioEngine={fakeAudioEngine} />)
  await userEvent.click(screen.getByRole('button', { name: /generate loop/i }))
  expect(screen.getAllByRole('button', { name: /step/i, pressed: true }).length).toBeGreaterThan(0)
  await userEvent.click(screen.getByRole('button', { name: /clear/i }))
  expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: /play/i }))
  expect(fakeAudioEngine.start).toHaveBeenCalled()
})
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/features/sequencer/Sequencer.test.tsx`
Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement accessible instrument UI**

Render three labelled rows and sixteen `aria-pressed` step buttons per row. Add play/stop, generate, mutate, clear, BPM, swing, key, scale, density, and mutation controls. Keep `App` as state/composition glue and inject the audio engine for tests.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run && npm run build`
Expected: PASS.

Commit: `git add src && git commit -m 'feat: build interactive sequencer controls'`

### Task 5: Visual concept, styling, and synchronized canvas

**Files:**
- Create: `design/musiccore-primary.png`
- Create: `src/features/visualizer/MusicVisualizer.tsx`, `MusicVisualizer.test.tsx`
- Create: `src/styles/tokens.css`, `src/styles/app.css`
- Modify: `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Produce and inspect the full-screen visual concept**

Use the image-generation workflow to create one complete desktop instrument screen matching the approved spec. Record exact palette, typography, spacing, button states, sequencer anatomy, and visualization treatment before writing CSS.

- [ ] **Step 2: Write a failing visualization test**

```tsx
it('renders an accessible visualization tied to the active step', () => {
  render(<MusicVisualizer activeStep={7} energy={{ drums: 1, bass: 0.5, melody: 0.25 }} />)
  expect(screen.getByLabelText(/music visualization, step 8/i)).toBeInTheDocument()
})
```

- [ ] **Step 3: Implement design tokens, responsive layout, and canvas animation**

Extract the concept into CSS custom properties and focused component rules. Canvas animation must read active step and energy props, use device-pixel-ratio scaling, cancel frames on unmount, and render a static low-motion state when reduced motion is requested.

- [ ] **Step 4: Verify visual states and commit**

Run: `npx vitest run && npm run build`
Expected: PASS with no overflow at 390px width.

Commit: `git add design src && git commit -m 'feat: add instrument styling and live visualization'`

### Task 6: Error states and full browser workflow

**Files:**
- Create: `e2e/musiccore.spec.ts`, `playwright.config.ts`
- Modify: `src/App.tsx`, `package.json`

- [ ] **Step 1: Write the end-to-end workflow**

```ts
test('creates and plays an editable loop', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /generate loop/i }).click()
  await expect(page.locator('[aria-pressed="true"]')).not.toHaveCount(0)
  await page.getByRole('button', { name: /play/i }).click()
  await expect(page.getByTestId('active-step')).not.toHaveText('1', { timeout: 2000 })
  await page.getByLabel(/tempo/i).fill('140')
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /clear/i }).click()
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0)
})
```

- [ ] **Step 2: Add inline audio startup failure handling**

Catch context creation/resume failures, keep the pattern editable, and show a role=`alert` message with a retry action. Clear the message after successful start.

- [ ] **Step 3: Run all automated verification**

Run: `npm run lint && npm test -- --run && npm run build && npx playwright test`
Expected: all checks PASS.

- [ ] **Step 4: Live-browser visual and interaction verification**

Open the Vite app in the in-app browser, exercise generate/edit/play/tempo/stop/clear, inspect console output, test desktop and 390px mobile widths, capture the latest implementation screenshot, and compare it with `design/musiccore-primary.png` using image inspection. Fix all material mismatches and repeat until the design and behavior pass.

- [ ] **Step 5: Final commit**

Commit: `git add . && git commit -m 'test: verify musiccore end to end'`

### Task 7: Cloudflare song storage, WebSockets, and MIDI

**Files:**
- Create: `wrangler.jsonc`, `worker/index.ts`, `worker/SongRoom.ts`, `worker/schema.ts`, `worker/midi.ts`
- Create: `worker/SongRoom.test.ts`, `worker/midi.test.ts`, `vitest.worker.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Cloudflare runtime and test dependencies**

Run: `npm install agents @modelcontextprotocol/sdk zod && npm install -D wrangler @cloudflare/workers-types @cloudflare/vitest-pool-workers`
Expected: lockfile resolves without peer dependency errors.

- [ ] **Step 2: Write failing Worker tests**

Test create/read/update with `expectedRevision`, stale-write 409 behavior, persisted reload, two-client WebSocket broadcast, and a MIDI response beginning with `MThd`.

- [ ] **Step 3: Confirm Worker test failure**

Run: `npx vitest run --config vitest.worker.config.ts`
Expected: FAIL because Worker modules do not exist.

- [ ] **Step 4: Implement the Worker and `SongRoom` Durable Object**

Use `env.SONGS.getByName(slug)` and a SQLite-backed `SongRoom`. Persist canonical song/revision/events before broadcasting. Use `this.ctx.acceptWebSocket(server)` and hibernation event handlers. Route `POST /api/songs`, `GET|PUT /api/songs/:slug`, `GET /api/songs/:slug/midi`, and `GET /ws/:slug`. Enforce high-entropy slugs, strict size-bounded Zod schemas, and optimistic revisions.

- [ ] **Step 5: Verify and commit**

Run: `npx wrangler types && npm test -- --run && npx vitest run --config vitest.worker.config.ts && npm run build && npm run lint`
Expected: all checks PASS.

Commit: `git add . && git commit -m 'feat: add durable public song rooms'`

### Task 8: Public Streamable HTTP MCP

**Files:**
- Create: `worker/mcp.ts`, `worker/mcp.test.ts`
- Modify: `worker/index.ts`, `README.md`

- [ ] **Step 1: Write failing MCP protocol tests**

Initialize `/mcp`, list tools, call `create_song`, call `get_song`, update with the returned revision, and assert the public URL and canonical pattern are returned.

- [ ] **Step 2: Confirm MCP test failure**

Run: `npx vitest run --config vitest.worker.config.ts worker/mcp.test.ts`
Expected: FAIL because `/mcp` is not implemented.

- [ ] **Step 3: Implement stateless MCP per request**

Create a fresh `McpServer` and `createMcpHandler()` for every request. Expose `create_song`, `get_song`, `update_song`, `mutate_song`, and `publish_song` using the same Durable Object RPC and schemas. Add concise server instructions covering the compose/edit/revision/publish workflow. Keep the endpoint deliberately authless and do not broadcast private reasoning.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run && npx vitest run --config vitest.worker.config.ts && npm run build && npm run lint`
Expected: PASS.

Commit: `git add worker README.md && git commit -m 'feat: expose public musiccore MCP'`

### Task 9: Public song client, Codex skill, deployment, and end-to-end proof

**Files:**
- Create: `src/remote/songClient.ts`, `src/remote/useSongRoom.ts`, `skills/musiccore/SKILL.md`, `.codex/config.toml`
- Modify: `src/App.tsx`, `package.json`, `README.md`
- Create: `e2e/published-song.spec.ts`

- [ ] **Step 1: Write failing client and browser tests**

Test publish returns and navigates to `/s/:slug`, remote snapshot loads, a WebSocket revision replaces local state, stale saves surface a conflict, and two pages converge after one edit.

- [ ] **Step 2: Implement public session client and UI**

Add Publish/Copy URL status without displacing the instrument. Load slugs from the pathname, reconnect WebSockets with snapshot refresh, debounce bounded writes, and display public/authless status clearly.

- [ ] **Step 3: Add Codex integration artifacts**

Write a project skill that teaches Codex to use MCP tools to create, iteratively edit, and publish a song. Add a project-scoped example `.codex/config.toml` entry with the deployed Streamable HTTP `/mcp` URL after deployment.

- [ ] **Step 4: Verify Cloudflare authentication and deploy**

Run: `npx wrangler whoami && npm run build && npx wrangler deploy`
Expected: authenticated account details, successful build, and a deployed workers.dev URL.

- [ ] **Step 5: Verify deployed behavior end to end**

Use the live browser for desktop/mobile instrument workflows. Open one slug in two pages, update through UI and MCP, verify live fan-out and reload persistence, download and inspect MIDI, check console/network errors, and run MCP Inspector/Codex against `/mcp`. Capture the final browser screenshot and compare it directly with `design/musiccore-primary.png` using image inspection.

- [ ] **Step 6: Commit deployment configuration and evidence**

Commit: `git add . && git commit -m 'feat: publish collaborative musiccore on cloudflare'`

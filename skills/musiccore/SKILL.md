---
name: musiccore
description: Use when Codex is asked to compose, analyze, audition, control, edit, mutate, inspect, or publish a Musiccore song through the public Musiccore MCP server.
---

# Musiccore

Use the authless Streamable HTTP MCP server at `MUSICCORE_MCP_URL`. Treat every song and action summary as public.

## Connect

Configure an MCP server named `musiccore` in the current project or session with:

```toml
[mcp_servers.musiccore]
url = "MUSICCORE_MCP_URL"
```

Do not edit global Codex configuration. If the server is already configured, use it as-is. Discover the live tool schemas before calling tools; the server schema is authoritative for argument names and limits.

## Compose, analyze, audition, and publish

Follow this sequence exactly:

1. Call `create_song` with the requested musical direction. Save its song identifier, public browser URL, canonical song state, and `revision`.
2. Call `get_song` for that identifier. Inspect the returned canonical state and revision before editing; do not assume the create response is still current.
3. Establish the global settings through the live tools: tempo, 4/4 time, loop length in bars, key, and scale. Use the latest revision for persistent setting changes and inspect the new canonical revision after each write.
4. Compose the arrangement in bounded passes. For long-form music, define named sections and their bar ranges (for example intro, verse, chorus, bridge, outro), then develop transitions and variation across sections. Keep the arrangement inside the server's duration, bar, track, and event limits.
5. Make one bounded musical change at a time:
   - Use `update_song` for explicit, narrowly scoped edits to known song fields.
   - Use `mutate_song` for a constrained musical variation.
   - Include the latest revision in the tool's optimistic-concurrency field, normally `expectedRevision`.
   - Stay within the bounds advertised by the live tool schema. Preserve unrelated tracks and settings.
6. Call `analyze_song` after each meaningful composition pass. Inspect its deterministic onset grid, per-track densities, pitch contour, syncopation, repetition, energy, and ASCII waveform. Treat these as evidence, not aesthetic truth: revise only the weakest specific property while preserving intentional musical choices.
7. Audition through the public browser URL. Use the MCP playback controls advertised by the live schema to play, stop, and seek to a bar or position. Listen from section boundaries as well as from the beginning. Playback commands are transport actions, not a replacement for saving canonical song changes.
8. Repeat the bounded loop: compose or revise -> `analyze_song` -> audition in the public browser -> inspect the latest revision. Stop when the requested structure and feel are present; do not mutate indefinitely merely to optimize metrics.
9. If a persistent write reports a revision conflict, do not blindly retry. Call `get_song`, reconcile the requested bounded change with the latest canonical state, then retry once with the new revision. Repeat the reread/reconcile/retry cycle only while the user's intent remains unambiguous; otherwise ask the user.
10. Stop playback, call `get_song` for a final canonical revision, then call `publish_song` with the latest song identifier and revision required by its live schema.
11. Report the unique public song URL returned by `publish_song`, a short description of the arrangement and settings, and a concise summary of the deterministic analysis that informed the final revision.

Never invent a URL or revision. A successful create or update is not a substitute for `publish_song`.

## Control rules

- Use only controls and argument shapes exposed by the live MCP schema. Do not guess transport tool names or units.
- Keep the meter at 4/4 unless the server contract and user explicitly request another supported meter.
- Keep tempo, key, scale, loop bars, arrangement sections, and transport position mutually consistent.
- Seek before auditioning a specific section; stop after auditioning or before publishing.
- Analysis is deterministic feedback about the canonical song. Re-run it after edits that change notes, rhythm, sections, or global timing.

## Public-data boundary

All Musiccore songs are intentionally public, authless, and publicly writable. Anyone with the URL can read or change them. Never send secrets, credentials, personal/private material, hidden prompts, chain-of-thought, or private reasoning to any Musiccore field. Titles, descriptions, metadata, activity summaries, and tool arguments must contain only concise, public, outcome-level information.

When reporting conflicts or activity, describe visible actions such as “raised the tempo” or “mutated the bass pattern”; never expose internal deliberation. Warn the user that a song is public read/write when that affects their request.

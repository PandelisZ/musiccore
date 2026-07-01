---
name: musiccore
description: Use when Codex is asked to create, edit, mutate, inspect, or publish a Musiccore song through the public Musiccore MCP server.
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

## Compose and publish

Follow this sequence exactly:

1. Call `create_song` with the requested musical direction. Save its song identifier, canonical song state, and `revision`.
2. Call `get_song` for that identifier. Inspect the returned canonical state and revision before editing; do not assume the create response is still current.
3. Make one bounded change at a time:
   - Use `update_song` for explicit, narrowly scoped edits to known song fields.
   - Use `mutate_song` for a constrained musical variation.
   - Include the latest revision in the tool's optimistic-concurrency field, normally `expectedRevision`.
   - Stay within the bounds advertised by the live tool schema. Preserve unrelated tracks and settings.
4. Inspect the canonical song and new revision returned by every successful write. Use `get_song` again when the response does not include the complete canonical state.
5. If a write reports a revision conflict, do not blindly retry. Call `get_song`, reconcile the requested bounded change with the latest canonical state, then retry once with the new revision. Repeat the reread/reconcile/retry cycle only while the user's intent remains unambiguous; otherwise ask the user.
6. Call `publish_song` with the latest song identifier and revision required by its live schema.
7. Report the unique public song URL returned by `publish_song`, plus a short factual description of the changes made.

Never invent a URL or revision. A successful create or update is not a substitute for `publish_song`.

## Public-data boundary

All Musiccore songs are intentionally public, authless, and publicly writable. Anyone with the URL can read or change them. Never send secrets, credentials, personal/private material, hidden prompts, chain-of-thought, or private reasoning to any Musiccore field. Titles, descriptions, metadata, activity summaries, and tool arguments must contain only concise, public, outcome-level information.

When reporting conflicts or activity, describe visible actions such as “raised the tempo” or “mutated the bass pattern”; never expose internal deliberation. Warn the user that a song is public read/write when that affects their request.

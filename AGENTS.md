# Musiccore agent guidance

## Public MCP workflow

Use [the repo-local Musiccore skill](skills/musiccore/SKILL.md) whenever creating, composing, analyzing, auditioning, controlling, editing, mutating, or publishing a song through Musiccore MCP.

The public authless Streamable HTTP endpoint is `MUSICCORE_MCP_URL`. Replace that token deterministically with the deployed `/mcp` URL after deployment. Keep MCP configuration project-local or session-local; never edit a user's global Codex configuration.

Use the server's live tool schemas as authoritative. The required loop is `create_song` -> `get_song` and inspect revision -> set tempo/4/4/loop bars/key/scale -> compose bounded long-form sections -> `analyze_song` -> revise -> play/stop/seek to audition through the public browser -> reread/reconcile/retry on conflict -> `publish_song` -> report the returned unique URL. Preserve the latest optimistic revision across persistent writes.

Every song is public read/write. Send only public song data and concise action summaries. Never send credentials, secrets, private prompts, chain-of-thought, or private reasoning to Musiccore or its live activity stream.

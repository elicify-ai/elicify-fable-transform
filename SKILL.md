---
name: vertex
description: Inject harness directives into the LLM input via the official opencode chat.system.transform and chat.messages.transform hooks. The correct, SDK-native place to add post-tool evidence, loop reminders, and per-session instructions — instead of stamping tool output. Use when wiring a verification/contract block, a stop-block reminder, or any per-session directive that should reach the LLM as a system instruction rather than as part of a tool reply. Triggers on phrases like "add a verification reminder to the LLM", "inject a contract block into the system prompt", or when the elicify-vertex plugin is loaded and a Stop/PostToolUse hook needs to enqueue a directive.
---

# elicify-vertex

A reference opencode plugin that wires the **correct** LLM-input injection hooks: `experimental.chat.system.transform` (preferred, per-session) and `experimental.chat.messages.transform` (fallback, global).

## When to use

- You need to inject a directive (verification reminder, stop-block reason, per-session instruction) into the **next LLM call**, not as a tool-output stamp.
- You are wiring a Stop/PostToolUse hook and want the directive to land as a system instruction on the model's next turn.
- You are building a harness that needs a per-session directive queue with FIFO semantics and a cap.

## When NOT to use

- You only need to log evidence (use a sidecar file, not a transform hook).
- You want to steer the user, not the model (this plugin targets the LLM input).
- You need cross-session shared state (opencode plugins don't share runtime state; lift the queue to a separate module if you need that).

## How it works

1. The plugin exports a `DirectiveQueue` (per-session FIFO with cap).
2. Any code in your plugin (Stop, PostToolUse, custom event) calls `enqueue(sessionID, { id, text })`.
3. On the next LLM call, `experimental.chat.system.transform` drains the queue for that session and appends a tagged block to the system prompt:

```
<elicify-vertex-directives ts="2026-07-23T...">
[elicify-vertex:contract]
[elicify-vertex] Verification reminder: ...
</elicify-vertex-directives>
```

4. If `system.transform` is unavailable, the optional `experimental.chat.messages.transform` fallback rewrites the messages array and tags the directives onto the last message as a synthetic note.

## API (from `src/index.ts`)

```ts
import ElicifyVertexPlugin from "elicify-vertex"

const t = await ElicifyVertexPlugin(ctx)
t.enqueue(sessionID, {
  id: "post-tool:evidence",
  text: "Tool call observed a failure. Surface it; do not retry silently.",
})
```

## Install (opencode)

In `opencode.json`:

```json
{
  "plugin": ["elicify-vertex"]
}
```

For local development, point the plugin at the working copy:

```json
{ "plugin": ["./elicify-vertex/src/index.ts"] }
```

## Configuration

```ts
interface ElicifyVertexOptions {
  maxPerSession?: number         // default 16
  wireMessagesTransform?: boolean // default true
  systemDirectives?: () => Directive[] // default: verification reminder
}
```

## Verify

```bash
npm install
npm run typecheck
npm test
npm run build
```

## See also

- The companion primary agent: **Elicify-Fable-Architect** (lives in `~/.config/opencode/agents/elicify-vertex-architect.md`).
- The opencode plugin SDK: https://opencode.ai/docs/plugins/

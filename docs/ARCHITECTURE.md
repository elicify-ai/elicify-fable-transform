# Architecture

Closed-loop harness implemented primarily in `src/index.ts`, with goal state in `src/goals.ts`, out-of-band telemetry in `src/measurement.ts`, and disk redaction in `src/redaction.ts`.  
Plugin-only host entry: `src/plugin.ts` → `dist/plugin.js`.

## Closed loop

```
inject → observe → record → check → block
```

| Phase | Mechanism |
|-------|-----------|
| **Inject** | `experimental.chat.system.transform` appends formatted directives to the system prompt for gate-active sessions. |
| **Observe** | `tool.execute.after` (and optionally `file.edited`) sees mutations, bash output/exit, failures. `experimental.text.complete` stores last assistant text. |
| **Record** | Per-session `EvidenceLedger` + in-memory `VerificationReceiptStore`; measurement JSONL side channel. |
| **Check** | On `session.idle`: promise-no-act rules, then `shouldBlockStop`. |
| **Block** | Enqueue reason directive + `client.session.prompt` continuation (or warn past cap / holdout allow). |

Inactive sessions: no inject, no ledger mutation from tools (receipt minting for goals on verified bash still runs so goals work from any agent).

## Hooks table

| Hook | Role |
|------|------|
| `config` | Registers `/elicify-vertex` and goal slash commands. |
| `command.execute.before` | Activates gate for `elicify-vertex` / `vertex` commands. |
| `chat.message` | Activate/deactivate gate; classify task + stop mode; reset ledger (unless gate continuation). |
| `tool.execute.after` | Observe mutations and bash verification/failures; mint receipts; enqueue failure / repeat-failure directives. |
| `experimental.chat.system.transform` | **Only** consumer of `DirectiveQueue.drain`; injects always-on + signal + mode + ledger + queued blocks. |
| `experimental.chat.messages.transform` | Present when `wireMessagesTransform` (default true); **no-op**, does not drain queue (avoids racing system path). |
| `experimental.text.complete` | Cache last assistant text for promise-no-act. |
| `experimental.session.compacting` | Mark session compacting so system transform **skips drain** (preserves queued directives across compaction). |
| `event` → `session.compacted` | Clear compacting flag. |
| `event` → `file.edited` | If exactly one active session: invalidate receipts + record path as changed. |
| `event` → `session.idle` | Stop gate + promise-no-act enforcement. |
| `tool` (`elicify_vertex_goal_*`) | Persisted multi-story goals API. |

Public method on the hooks object: `enqueue(sessionID, directive)` for external callers.

## Directive IDs

IDs appear in formatted blocks as `[id]` / narrative tags `[vertex:…]`.

| ID | Source |
|----|--------|
| `vertex:contract` | Default always-on system directive |
| `vertex:investigation` | Task mode `debugging` |
| `vertex:grounding` | Task mode `render` |
| `vertex:review-recall` | Review-task signal (`isReviewTask`) |
| `vertex:verification-advisory` | Stop mode normal |
| `vertex:verification-required` | Stop mode deep |
| `vertex:ledger` | Non-empty evidence summary this turn |
| `vertex:tool-failure` | Bash non-zero exit (first occurrence class) |
| `vertex:repeat-failure` | Same failure signature ≥ 2 times this turn |
| `vertex:stop-block` | Deep + changed + non-docs + unverified idle |
| `vertex:stop-warning` | Stop blocks at/over cap |
| `vertex:promise-no-act` | Promise-no-act hard block |
| `vertex:promise-no-act-warn` | Promise-no-act past cap |
| `vertex:verification-receipt` | Suffix on tool output (not a system directive); receipt id for goals |

Formatted envelope:

```text
<vertex-directives ts="ISO8601">
[id @ optional-iso]
text
---
…
</vertex-directives>
```

## Measurement events

Module: `src/measurement.ts`. **Never** injected into the model. Append-only JSONL at `eventsPath()` = `<VERTEX_DATA|~/.config/opencode>/.vertex-events.jsonl`. Payloads pass through `redactForDisk`.

Each line includes: `ts`, `session_id`, `holdout_arm` (`on`|`off`), `event_type`, `payload`.

| `event_type` | Typical payload | When |
|--------------|-----------------|------|
| `classify` | `mode`, optional `agent`, `trigger`, `risks`, `review` | Gate activation on user message |
| `gate_fire` | `decision` (`block`\|`warn`\|`allow`), `changed`, `verified`, `stop_blocks`, `max_stop_blocks`, `would_block`, optional `reason` | Idle gate / promise paths; also allow when nothing to block |
| `holdout_suppress` | `reason` | `VERTEX_HOLDOUT=1` and arm `off` skipped enforcement |
| `recovery_repeat` | `signature`, `count` | Repeat failure detected in tool path |
| `outcome` | optional rework counters | Writer API exists for post-hoc collectors; not written on the hot path by the plugin |

Holdout: SHA-256 of `"holdout|" + sessionId` → ~20% `off` (`HOLDOUT_OFF_FRACTION`). Suppression only if env `VERTEX_HOLDOUT=1`. Sunset constant `SUNSET_SESSIONS = 50` is exported for offline analysis (plugin does not auto-disable).

## Supporting modules

| Module | Responsibility |
|--------|----------------|
| `EvidenceLedger` | Per-turn mutation kinds, mode, risks, verification list, failure signatures, stop/promise counters |
| `DirectiveQueue` | Per-session FIFO capped queue |
| `SessionGate` | Active session set |
| `parseVerification` / `changedPathsFromTool` / `isMutatingBashCommand` | Observe path classifiers |
| `MultiStoryGoalEngine` | Locked write of `.elicify-vertex/goals.json` + ledger |
| `VerificationReceiptStore` | Session-scoped verified bash receipts (invalidated on mutation) |
| `redactSecrets` / `redactForDisk` | All disk and debug writes |

## Package boundary

- `export default` / `server` from `src/plugin.ts`: factory only (OpenCode host).
- `./lib` export (`dist/index.js`): factory **plus** pure helpers for tests and tooling.

See [CONFIGURATION.md](./CONFIGURATION.md), [USAGE.md](./USAGE.md), [DEVELOPMENT.md](./DEVELOPMENT.md).

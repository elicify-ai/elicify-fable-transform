# elicify-fable-transform

An [opencode](https://opencode.ai) plugin that injects harness directives into the
**LLM input** — the way Claude's plugin runtime does via
`hookSpecificOutput.additionalContext` — using opencode's official
`chat.system.transform` and `chat.messages.transform` hooks.

> **Why this exists.** opencode's SDK does not (yet) expose a post-tool
> `additionalContext` equivalent whose output becomes a *new* message in the
> model's next turn. The naive workaround — stamping `output.output` in
> `tool.execute.after` — reaches the LLM, but as part of the **tool's
> reply**, not as a directive. Steering power is weak. This plugin wires
> the *correct* hooks: a per-session directive queue drained into the
> system prompt for the next LLM call.

## What it does

1. **Per-session directive queue.** Any code in your plugin (a Stop hook, a
   PostToolUse hook, a custom event handler) can call
   `t.enqueue(sessionID, { id, text })` to schedule a directive.
2. **`experimental.chat.system.transform`** — the SDK-native, **correct**
   hook. Appends queued + always-on directives to the system prompt for
   the next LLM call. Has `sessionID` in its input.
3. **`experimental.chat.messages.transform`** — optional fallback. Rewrites
   the messages array so any undrained directives still reach the LLM,
   tagged as a synthetic note on the last message. The SDK does not
   currently pass `sessionID` to this hook, so it is intentionally lossy.

## Install

The plugin is **self-contained** — no symlinks required.

### From npm

```bash
npm install elicify-fable-transform
```

The `postinstall` hook runs `scripts/install-skill.sh`, which copies the
shipped `SKILL.md` into `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills/elicify-fable-transform/SKILL.md`
as a **real file** (no symlink). The `/elicify-fable-transform` slash
command is then available in opencode.

Add the plugin to `opencode.json`:

```json
{
  "plugin": ["elicify-fable-transform"]
}
```

### From source (local dev)

```bash
git clone https://github.com/elicify-ai/elicify-fable-transform
cd elicify-fable-transform
npm install
npm run setup        # copies SKILL.md to ~/.config/opencode/skills/...
npm run build
```

Then point opencode at the working copy:

```json
{
  "plugin": ["./elicify-fable-transform/src/index.ts"]
}
```

### Custom install location

```bash
SKILL_TARGET_DIR=/path/to/skills/elicify-fable-transform bash scripts/install-skill.sh
```

To overwrite an existing `SKILL.md`:

```bash
SKILL_FORCE=1 bash scripts/install-skill.sh
```

### What is NOT a symlink

- The skill file is copied as a regular file.
- The plugin source lives in `node_modules/` (or your local path) as real files.
- No symlinks to `~/.claude/skills`, `~/.config/opencode/fablize`, or any other
  system path are created by this package.

If your `~/.config/opencode/skills` happens to be a symlink to
`~/.claude/skills` (a pre-existing system condition on elicify-devpods), the
plugin will follow it and write a real file there. That is the user's
symlink, not this plugin's.

## Usage from another plugin

```ts
import type { Plugin } from "@opencode-ai/plugin"
import ElicifyFableTransformPlugin from "elicify-fable-transform"

export const MyPlugin: Plugin = async (ctx) => {
  // 1) Ensure the transform plugin is also loaded (opencode loads it
  //    from opencode.json — no need to require() it here).
  // 2) In a Stop or PostToolUse hook, write a directive into the
  //    transform plugin's queue via a shared module:
  const t = await ElicifyFableTransformPlugin(ctx)

  return {
    async event({ event }) {
      if (event.type === "session.idle") {
        t.enqueue(event.properties.sessionID, {
          id: "stop:block",
          text: "Verification missing — observe a tool result before reporting done.",
        })
      }
    },
  }
}
```

> **Cross-plugin note.** Opencode's plugin runtime does not give plugins
> a shared registry. The cleanest way to enqueue directives from another
> plugin is to import the `DirectiveQueue` class directly from a small
> module (e.g. `./queue.js`) rather than going through the plugin return
> value. See `src/index.ts` for the in-memory queue implementation.

## API

### `Directive`

```ts
interface Directive {
  readonly id: string       // e.g. "post-tool:evidence"
  readonly text: string     // shown to the LLM
  readonly at?: string      // optional ISO timestamp; set on enqueue if missing
}
```

### `ElicifyFableTransformOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxPerSession` | `number` | `16` | Cap on queued directives per session. Oldest is dropped. |
| `wireMessagesTransform` | `boolean` | `true` | Also wire the messages-array rewrite as a fallback. |
| `systemDirectives` | `() => Directive[]` | elicify-fable reminder | Always-on directives injected every turn. |

### `formatDirectives(directives)`

Pure formatter exposed for tests and downstream plugins. Returns
`null` for an empty list, otherwise a tagged block suitable for appending
to a system prompt.

## Design choices (best practices)

- **ESM only**, `"type": "module"`. Matches the opencode plugin runtime.
- **Strict TypeScript** with `noUnused*`, `noImplicitReturns`. The SDK
  surface is small; treat its types as the contract.
- **No side effects at import time.** The plugin factory is `async` and
  returns hooks; the queue lives in the closure.
- **Append, never replace.** `system.transform` and `messages.transform`
  both add to the existing output so other plugins' transforms are
  preserved.
- **Tagged synthetic content.** Directives are wrapped in
  `<elicify-fable-directives ts="...">...</elicify-fable-directives>` so they are
  easy to grep for in logs and easy for the model to recognise as
  harness-injected (not user-typed).
- **Fails open.** No throw paths in the hooks — a broken transform must
  never break the LLM call.

## Verify

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT — see [LICENSE](./LICENSE).

## Companion artifacts

- **Skill:** `SKILL.md` (and `skills/elicify-fable-transform/SKILL.md`) — installable into `~/.config/opencode/skills/elicify-fable-transform/` for the `/elicify-fable-transform` slash command.
- **Architect agent:** **Elicify-Fable-Architect** — the principal orchestrator that uses this transform plugin to inject verification reminders. Lives in `~/.config/opencode/agents/elicify-fable-architect.md`.

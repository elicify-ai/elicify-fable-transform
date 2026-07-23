# Configuration

Plugin options, OpenCode registration, and install layout.  
Behavior detail: [USAGE.md](./USAGE.md). Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Plugin options

Passed as the second argument to the plugin factory (`ElicifyVertexPlugin(input, options)`). Type: `ElicifyVertexOptions` in `src/index.ts`.

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `activeAgent` | `string` | `"elicify-vertex-agent"` | `chat.message` agent name that activates the session gate. |
| `activeSkillTrigger` | `string` | `"/elicify-vertex"` | Slash/skill prefix that activates the gate. **`/vertex` is always accepted as an additional alternative** in the trigger regex. |
| `maxStopBlocks` | `number` | `3` | Max hard stop / promise-no-act blocks before warn-and-proceed. |
| `maxPerSession` | `number` | `16` | Cap on `DirectiveQueue` depth per session (FIFO drop from head). |
| `systemDirectives` | `() => readonly Directive[]` | Contract block (`vertex:contract`) | Always-on directives merged every `system.transform` while gate is active. |
| `wireMessagesTransform` | `boolean` | `true` | When true, registers `experimental.chat.messages.transform` as a **no-op** (does not drain the queue). When false, that hook is omitted. Queue drain is **only** in `system.transform`. |

OpenCode’s host how it maps JSON plugin options into `PluginOptions` depends on the host version; this package always accepts the TypeScript options object on the factory. Prefer the defaults unless you need a different agent name or trigger string.

### Directive shape

```ts
interface Directive {
  readonly id: string
  readonly text: string
  readonly at?: string  // ISO timestamp; set automatically on enqueue
}
```

## `opencode.json` plugin entry

### npm package name (production)

```json
{
  "plugin": ["@elicify-ai/elicify-vertex"]
}
```

Package name and version live in root `package.json` (`@elicify-ai/elicify-vertex`).  
OpenCode resolves the package main export (plugin-only; see [DEVELOPMENT.md](./DEVELOPMENT.md)).

### Local / file fallback

Build first (`npm run build`), then point at the plugin entry so the host does not load helper exports from the lib barrel:

```json
{
  "plugin": ["file:///absolute/path/to/elicify-vertex/dist/plugin.js"]
}
```

Relative path forms such as `"./path/to/dist/plugin.js"` may also work depending on OpenCode’s resolver; **plugin entry must be `dist/plugin.js` (or `.cjs`), not `dist/index.js`**, or helper exports can fail host validation (“Plugin export is not a function”). See `src/plugin.ts`.

Do **not** invent additional CLI flags for the plugin; configuration is via OpenCode plugin list + optional factory options, plus env vars in [USAGE.md](./USAGE.md).

## Skill and agent install paths

`scripts/install-skill.sh` (also `npm run setup`, and best-effort `postinstall`):

| Artifact | Source in package | Destination |
|----------|-------------------|---------------|
| Skill | `skills/vertex/SKILL.md` | `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills/vertex/SKILL.md`  
  Override directory: env `SKILL_TARGET_DIR` |
| Agent | `agents/elicify-vertex-agent.md` | `$CONFIG_ROOT/agent/elicify-vertex-agent.md` **and** `$CONFIG_ROOT/agents/elicify-vertex-agent.md` |

- `$CONFIG_ROOT` = `${XDG_CONFIG_HOME:-$HOME/.config}/opencode`
- Existing files are left in place unless `SKILL_FORCE=1`
- If `opencode.json` exists, the script appends `"@elicify-ai/elicify-vertex"` to the `plugin` array when missing
- If `opencode.json` is absent, it prints the manual plugin snippet and continues

Registered OpenCode **commands** (always, via plugin `config` hook, not the shell installer):  
`elicify-vertex`, `vertex`, `vertex-goal-create`, `vertex-goal-next`, `vertex-goal-checkpoint`, `vertex-goal-status`.

Unregister: `npm run uninstall` → `scripts/uninstall.sh` (see that script for exact reverse steps).

## Restart

After install or `opencode.json` edits, restart OpenCode so the plugin and agent files are picked up.

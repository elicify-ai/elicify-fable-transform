# elicify-vertex

**Make any model work like a senior engineer — not just answer like one.**

[![GitHub stars](https://img.shields.io/github/stars/elicify-ai/elicify-vertex?style=social)](https://github.com/elicify-ai/elicify-vertex)
[![npm version](https://img.shields.io/npm/v/@elicify-ai/elicify-vertex)](https://www.npmjs.com/package/@elicify-ai/elicify-vertex)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

> **If this helps you, please [star the repo](https://github.com/elicify-ai/elicify-vertex)** — it helps other developers discover it.

---

## What it is

**elicify-vertex** is an [OpenCode](https://opencode.ai) plugin that holds the model to a simple standard: **verify before claiming done**. It injects harness directives into the LLM input (via OpenCode’s official chat transform hooks), so the assistant runs tests, surfaces failures honestly, and reports outcomes with evidence — instead of asserting success and moving on.

---

## Install

```bash
npm install @elicify-ai/elicify-vertex
```

Requires Node **≥ 20**. Package version on npm: **`@elicify-ai/elicify-vertex@0.8.0`**.

`postinstall` runs `scripts/install-skill.sh`, which copies the skill and agent into your OpenCode config dirs (`~/.config/opencode/skills/vertex` and `~/.config/opencode/agent[s]/`). Restart OpenCode after install.

To re-run install later:

```bash
npm run setup
# or: bash scripts/install-skill.sh
# SKILL_FORCE=1 bash scripts/install-skill.sh   # overwrite existing skill/agent
```

---

## Enable in OpenCode

Add the package to your OpenCode config — global `~/.config/opencode/opencode.json`, or a project-level `opencode.json`:

```json
{
  "plugin": ["@elicify-ai/elicify-vertex"]
}
```

The postinstall script tries to append this for you; if `opencode.json` is missing or the plugin doesn’t load, set it manually.

### If you see `Plugin export is not a function`

Some OpenCode loaders fail on the bare package name. Point at the thin plugin entry instead (`dist/plugin.js` — default + `server` exports only):

```json
{
  "plugin": [
    "file:///absolute/path/to/node_modules/@elicify-ai/elicify-vertex/dist/plugin.js"
  ]
}
```

From a git clone (after `npm run build`):

```json
{
  "plugin": ["file:///absolute/path/to/elicify-vertex/dist/plugin.js"]
}
```

---

## How to use

The plugin loads quietly. It **injects harness behavior only when activated** for a session:

### 1. Agent (recommended for full workflow)

Select **Elicify-Vertex-Agent** (`elicify-vertex-agent`) in OpenCode. That primary agent plans, decomposes work, delegates when useful, and integrates only after verification.

### 2. Slash commands

In any session:

| Command | Effect |
|--------|--------|
| `/elicify-vertex` | Activate the verification harness for this session |
| `/vertex` | Same (short alias) |

Optional goal helpers (when the plugin is active): `/vertex-goal-create`, `/vertex-goal-next`, `/vertex-goal-checkpoint`, `/vertex-goal-status`.

### 3. Skill

The installed skill is **`vertex`** (`~/.config/opencode/skills/vertex/SKILL.md`). Use it when you want the harness discipline without switching primary agents, or when wiring directives from other hooks.

Agent + slash command can be used together: agent for strategy, harness for verification discipline.

---

## What you’ll notice

When Vertex is active for a session:

1. **“Done” means evidence** — successful verification commands, not only “I wrote the file.”
2. **Tests actually run** — you see the command and output.
3. **Failures are surfaced** — no silent retry loops on the same broken approach.
4. **Calmer reports** — result first, less filler.
5. **Other sessions stay untouched** — zero harness injection until you activate agent or `/vertex`.

If the plugin errors, it fails open (silent) so a broken harness never blocks your work.

---

## Docs

| Doc | Topic |
|-----|--------|
| [docs/README.md](./docs/README.md) | Docs index |
| [docs/USAGE.md](./docs/USAGE.md) | Day-to-day usage, goals, activation |
| [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) | Options (`maxPerSession`, agent/skill triggers, etc.) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Hooks, gates, directive IDs, measurement |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Build, test, UAT, local plugin development |

---

## Contributing

Issues, PRs, and discussions are welcome.

| If you want to… | Go to |
|---|---|
| Find live work | [open issues](https://github.com/elicify-ai/elicify-vertex/issues) |
| Ask a question / get help | [SUPPORT.md](./SUPPORT.md) |
| Set up to build | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Community expectations | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |
| Report a vulnerability | [SECURITY.md](./SECURITY.md) |
| Sign the CLA (before your first PR) | [Contributor License Agreement](./CLA.md) |

The **elicify-vertex** name is reserved per the [trademark policy](./TRADEMARKS.md).

External contributors sign a one-time [CLA](./CLA.md) before their first PR can merge. You keep copyright to your contribution; the CLA grants elicify.ai Pte. Ltd. a license to use it in the project.

---

## License

[MIT](./LICENSE) · Copyright © 2026 [elicify.ai Pte. Ltd.](https://github.com/elicify-ai)

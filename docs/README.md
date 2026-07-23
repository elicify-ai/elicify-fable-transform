# elicify-vertex developer docs

End-user install and “how to use” stay in the root [README](../README.md).  
This directory holds developer and power-user detail, grounded in the package source.

| Doc | Purpose |
|-----|---------|
| [USAGE.md](./USAGE.md) | Activation, stop gate, promise-no-act, verification, goals tools, env vars |
| [CONFIGURATION.md](./CONFIGURATION.md) | Plugin options, `opencode.json` entries, skill/agent install paths |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Closed loop, hooks, directive IDs, measurement events |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Build, test, UAT harnesses, package entry points |

**Package:** `@elicify-ai/elicify-vertex` (see root `package.json`)

**Primary sources:** `src/index.ts`, `src/plugin.ts`, `src/goals.ts`, `src/measurement.ts`, `src/redaction.ts`

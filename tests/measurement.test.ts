/**
 * elicify-vertex — measurement layer tests
 * --------------------------------------------------------------------------
 * Mirrors fablize tests/test_shadow.py + test_shadow_m3.py conventions in
 * vitest. Verifies: deterministic holdout, ~20% fraction, env-gated
 * suppression default-OFF, events written out-of-band (not into the repo).
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  HOLDOUT_OFF_FRACTION,
  SUNSET_SESSIONS,
  appendEvent,
  dataRoot,
  eventsPath,
  holdoutArm,
  holdoutSuppresses,
  logClassify,
  logGateFire,
  logHoldoutSuppress,
  logOutcome,
  logRecoveryRepeat,
  makeEvent,
} from "../src/measurement.js"

// Mirrors fablize/tests/test_shadow.py:21-93.

let tmpRoot: string
let savedVertexData: string | undefined
let savedVertexHoldout: string | undefined

beforeEach(() => {
  savedVertexData = process.env.VERTEX_DATA
  savedVertexHoldout = process.env.VERTEX_HOLDOUT
  tmpRoot = mkdtempSync(join(tmpdir(), "vertex-meas-"))
  process.env.VERTEX_DATA = tmpRoot
  // ensure default-OFF (test_shadow_m3.py:49)
  delete process.env.VERTEX_HOLDOUT
})

afterEach(() => {
  if (savedVertexData === undefined) delete process.env.VERTEX_DATA
  else process.env.VERTEX_DATA = savedVertexData
  if (savedVertexHoldout === undefined) delete process.env.VERTEX_HOLDOUT
  else process.env.VERTEX_HOLDOUT = savedVertexHoldout
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe("holdoutArm", () => {
  it("is deterministic for the same sessionID (test_shadow.py:27-28)", () => {
    expect(holdoutArm("abc")).toBe(holdoutArm("abc"))
  })

  it("treats empty sessionID as 'on' (shadow_logger.py:47)", () => {
    expect(holdoutArm("")).toBe("on")
    expect(holdoutArm(undefined)).toBe("on")
    expect(holdoutArm(null)).toBe("on")
  })

  it("is ~20% off over 3000 sessions (test_shadow.py:31-35)", () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `sess-${i}`)
    const off = ids.filter((s) => holdoutArm(s) === "off").length
    const frac = off / ids.length
    expect(frac).toBeGreaterThan(0.15)
    expect(frac).toBeLessThan(0.25)
    expect(HOLDOUT_OFF_FRACTION).toBe(0.2)
  })

  it("exposes SUNSET_SESSIONS=50 (shadow_logger.py:24, MEASUREMENT_PROTOCOL.md §7)", () => {
    expect(SUNSET_SESSIONS).toBe(50)
  })
})

describe("holdoutSuppresses (env-gated, default OFF; mirrors gate_stop.py:26-38)", () => {
  it("does NOT suppress by default (test_shadow_m3.py:49-51)", () => {
    // find an off-arm session deterministically
    const off = Array.from({ length: 5000 }, (_, i) => `s${i}`).find(
      (s) => holdoutArm(s) === "off",
    )!
    expect(holdoutSuppresses(off)).toBe(false)
  })

  it("suppresses off-arm only when VERTEX_HOLDOUT=1 (test_shadow_m3.py:53-57)", () => {
    process.env.VERTEX_HOLDOUT = "1"
    const off = Array.from({ length: 5000 }, (_, i) => `s${i}`).find(
      (s) => holdoutArm(s) === "off",
    )!
    const on = Array.from({ length: 5000 }, (_, i) => `s${i}`).find(
      (s) => holdoutArm(s) === "on",
    )!
    expect(holdoutSuppresses(off)).toBe(true)
    expect(holdoutSuppresses(on)).toBe(false)
  })
})

describe("event schema (MEASUREMENT_PROTOCOL.md §2; shadow_logger.py:53-60)", () => {
  it("makeEvent produces ts/session_id/holdout_arm/event_type/payload", () => {
    const ev = makeEvent("sess-1", "classify", { mode: "build" })
    expect(ev).toMatchObject({
      session_id: "sess-1",
      holdout_arm: holdoutArm("sess-1"),
      event_type: "classify",
      payload: { mode: "build" },
    })
    expect(typeof ev.ts).toBe("string")
    expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("uses 'no-session' when sessionID is empty (shadow_logger.py:57)", () => {
    const ev = makeEvent("", "classify", {})
    expect(ev.session_id).toBe("no-session")
  })
})

describe("appendEvent / out-of-band (shadow_logger.py:63-69, test_shadow.py:80-82)", () => {
  it("writes one JSONL line per event to the resolved events path", () => {
    const ep = eventsPath()
    expect(ep.startsWith(tmpRoot)).toBe(true)
    appendEvent(makeEvent("a", "classify", { mode: "build" }))
    appendEvent(makeEvent("a", "gate_fire", { decision: "block" }))
    const lines = readFileSync(ep, "utf8").trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({ event_type: "classify" })
    expect(JSON.parse(lines[1])).toMatchObject({ event_type: "gate_fire" })
  })

  it("never writes into the project repo (test_shadow.py:80-82)", () => {
    appendEvent(makeEvent("x", "classify", {}))
    const ep = eventsPath()
    const repoRoot = resolve(__dirname, "..")
    expect(ep.startsWith(repoRoot)).toBe(false)
  })

  it("creates the data root if missing (shadow_logger.py:66)", () => {
    rmSync(tmpRoot, { recursive: true, force: true })
    expect(() => appendEvent(makeEvent("x", "classify", {}))).not.toThrow()
  })

  it("is append-only across calls (shadow_logger.py:64)", () => {
    appendEvent(makeEvent("a", "classify", { n: 1 }))
    appendEvent(makeEvent("a", "classify", { n: 2 }))
    const lines = readFileSync(eventsPath(), "utf8").trim().split("\n")
    expect(JSON.parse(lines[0]).payload.n).toBe(1)
    expect(JSON.parse(lines[1]).payload.n).toBe(2)
  })
})

describe("typed writers (mirror shadow_collect.py:74-91)", () => {
  it("logClassify / logGateFire / logRecoveryRepeat / logOutcome / logHoldoutSuppress all emit the right event_type", () => {
    const sid = "sess-typed"
    logClassify(sid, { mode: "build", agent: "elicify-vertex-agent" })
    logGateFire(sid, {
      decision: "block",
      changed: true,
      verified: false,
      stop_blocks: 1,
      max_stop_blocks: 3,
      would_block: true,
    })
    logRecoveryRepeat(sid, { signature: "1:err", count: 3 })
    logHoldoutSuppress(sid, "stop-block skipped (holdout arm=off)")
    logOutcome(sid, { reverts: 0, reinstructions: 1, commits: 2 })

    const lines = readFileSync(eventsPath(), "utf8").trim().split("\n")
    expect(lines).toHaveLength(5)
    const types = lines.map((l) => JSON.parse(l).event_type)
    expect(types).toEqual([
      "classify",
      "gate_fire",
      "recovery_repeat",
      "holdout_suppress",
      "outcome",
    ])
  })

  it("every typed event carries the same holdout_arm as a same-session holdoutArm() call", () => {
    const sid = "sess-arm"
    logClassify(sid, { mode: "build" })
    logGateFire(sid, {
      decision: "allow",
      changed: false,
      verified: true,
      stop_blocks: 0,
      max_stop_blocks: 3,
      would_block: false,
    })
    const lines = readFileSync(eventsPath(), "utf8").trim().split("\n")
    const expected = holdoutArm(sid)
    for (const line of lines) {
      const ev = JSON.parse(line)
      expect(ev.holdout_arm).toBe(expected)
    }
  })
})

describe("out-of-band guarantee (MEASUREMENT_PROTOCOL.md §3)", () => {
  it("the module exports NO function that returns model-context text", async () => {
    // Static guard: no exported name matches the model's directive/queue API.
    const mod = await import("../src/measurement.js")
    const exported = Object.keys(mod)
    const forbidden = ["formatDirectives", "enqueue", "VertexContract", "VERTEX_CONTRACT"]
    for (const f of forbidden) {
      expect(exported).not.toContain(f)
    }
  })
})

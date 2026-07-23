import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  EvidenceLedger,
  classifyStopMode,
  detectRiskFlags,
} from "../src/index.js"
import { appendEvent, makeEvent } from "../src/measurement.js"
import { redactForDisk, redactSecrets } from "../src/redaction.js"

// Item 4 extends fablize's risk classifier and moves redaction to the final
// write boundary (/tmp/fablize-deep/scripts/gate/classify_task.py:29-40;
// /tmp/fablize-deep/scripts/gate/ledger.py:34-39,108-115).

describe("detectRiskFlags", () => {
  it.each([
    ["deploy to production", "production"],
    ["prepare a release", "remote-write"],
    ["run the schema migration against the db", "database"],
    ["rotate the API_KEY and password", "secret-or-auth"],
    ["git push the result", "remote-write"],
    ["publish the package", "remote-write"],
  ] as const)("maps %s to %s", (prompt, risk) => {
    expect(detectRiskFlags(prompt)).toContain(risk)
  })

  it("returns stable unique enum flags when several keywords overlap", () => {
    expect(detectRiskFlags("deploy the production database migration, then publish")).toEqual([
      "production",
      "database",
      "remote-write",
    ])
  })

  it("supports Korean risk annotations beyond fablize's English-only hot path", () => {
    expect(detectRiskFlags("운영 환경에 데이터베이스 스키마를 배포하고 토큰을 게시")).toEqual([
      "production",
      "database",
      "secret-or-auth",
      "remote-write",
    ])
  })

  it("does not match risk words embedded in unrelated identifiers", () => {
    expect(detectRiskFlags("tokenize the databaseName field without edits")).toEqual([])
  })

  it("promotes every risk category to deep mode", () => {
    expect(classifyStopMode("briefly rotate token").mode).toBe("deep")
  })

  it("stores enum risks in the EvidenceLedger and exposes them in its summary", () => {
    const ledger = new EvidenceLedger()
    ledger.reset("s1", "deep", ["database", "secret-or-auth"])
    expect(ledger.getRiskFlags("s1")).toEqual(["database", "secret-or-auth"])
    expect(ledger.summary("s1")).toContain("risks: database, secret-or-auth")
  })
})

describe("redactSecrets", () => {
  it.each([
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    "api_key=sk-abcdefghijklmnopqrstuvwxyz",
    "password: super-secret-value",
    "password=\"secret value with spaces\"",
    "password=correct horse battery staple",
    "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz",
    "token ghp_abcdefghijklmnopqrstuvwxyz",
    "npm_abcdefghijklmnopqrstuvwxyz",
    "glpat-abcdefghijklmnopqrstuvwxyz",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.dGVzdHNpZ25hdHVyZQ",
    "AccountKey=abcdefghijklmnopqrstuvwxyz",
    "xoxb-abcdefghijklmnopqrstuvwxyz",
    "https://user:password@example.test/path",
    "postgres://user:password@db.internal/app",
    "private_key=-----BEGIN PRIVATE KEY-----\nVERYPRIVATE\n-----END PRIVATE KEY-----",
  ])("removes secret material from %s", (input) => {
    const redacted = redactSecrets(input)
    expect(redacted).toMatch(/\[REDACTED(?::JWT)?\]/)
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz")
    expect(redacted).not.toContain("super-secret-value")
    expect(redacted).not.toContain("secret value with spaces")
    expect(redacted).not.toContain("correct horse battery staple")
    expect(redacted).not.toContain("user:password")
    expect(redacted).not.toContain("VERYPRIVATE")
    expect(redacted).not.toContain("eyJhbGci")
  })

  it("recursively redacts sensitive object keys, nested strings, arrays, and cycles", () => {
    const circular: Record<string, unknown> = {
      password: "plain-value",
      nested: {
        message: "Bearer abcdefghijklmnopqrstuvwxyz",
        api_key: "another-value",
        "x-api-key": "header-value",
        "set-cookie": "session=secret-value",
      },
      values: ["token=secret-value", "safe"],
    }
    circular.self = circular

    const redacted = redactForDisk(circular)
    expect(redacted.password).toBe("[REDACTED]")
    expect(redacted.nested).toEqual({
      message: "Bearer [REDACTED]",
      api_key: "[REDACTED]",
      "x-api-key": "[REDACTED]",
      "set-cookie": "[REDACTED]",
    })
    expect(redacted.values).toEqual(["token=[REDACTED]", "safe"])
    expect(redacted.self).toBe("[REDACTED:CIRCULAR]")
  })
})

describe("measurement disk boundary", () => {
  const paths: string[] = []

  afterEach(() => {
    for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
  })

  it("redacts the complete event immediately before writing and restricts permissions", () => {
    const root = mkdtempSync(join(tmpdir(), "vertex-redaction-"))
    paths.push(root)
    const path = join(root, "events.jsonl")
    const event = makeEvent("s1", "classify", {
      mode: "deep",
      command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'",
      password: "plain-value",
      nested: { token: "another-value" },
    })

    // In-memory measurement remains useful to the caller; only persistence is sanitized.
    expect(event.payload.password).toBe("plain-value")
    appendEvent(event, path)

    const written = readFileSync(path, "utf8")
    expect(written).not.toContain("abcdefghijklmnopqrstuvwxyz")
    expect(written).not.toContain("plain-value")
    expect(written).not.toContain("another-value")
    expect(written).toContain("[REDACTED]")
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})

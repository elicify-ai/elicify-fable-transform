import { describe, expect, it } from "vitest"
import { formatDirectives, type Directive } from "../src/index.js"

describe("formatDirectives", () => {
  it("returns null for an empty list", () => {
    expect(formatDirectives([])).toBeNull()
  })

  it("wraps a single directive in a tagged block with a timestamp", () => {
    const d: Directive = { id: "post-tool:evidence", text: "show evidence" }
    const out = formatDirectives([d])
    expect(out).not.toBeNull()
    expect(out).toMatch(/^<fablize-directives ts="[^"]+">/)
    expect(out).toMatch(/\[post-tool:evidence\]/)
    expect(out).toMatch(/show evidence/)
    expect(out).toMatch(/<\/fablize-directives>$/)
  })

  it("joins multiple directives with a horizontal rule", () => {
    const ds: Directive[] = [
      { id: "a", text: "first" },
      { id: "b", text: "second" },
    ]
    const out = formatDirectives(ds) ?? ""
    expect(out).toMatch(/first[\s\S]*---[\s\S]*second/)
  })

  it("preserves directive timestamps when provided", () => {
    const d: Directive = { id: "x", text: "y", at: "2026-01-02T03:04:05.000Z" }
    const out = formatDirectives([d]) ?? ""
    expect(out).toMatch(/\[x @ 2026-01-02T03:04:05\.000Z\]/)
  })
})

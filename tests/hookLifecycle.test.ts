import { describe, expect, it, vi } from "vitest"

import { ElicifyVertexPlugin } from "../src/index.js"

function pluginInput(prompt = vi.fn(async () => ({}))) {
  return {
    client: { session: { prompt } },
    directory: "/work",
    worktree: "/work",
  } as any
}

async function activate(hooks: Awaited<ReturnType<typeof ElicifyVertexPlugin>>, sessionID: string, text: string) {
  await hooks["chat.message"]!({ sessionID, agent: "elicify-vertex-agent" } as any, {
    message: {} as any,
    parts: [{ type: "text", text } as any],
  })
}

async function completeText(hooks: Awaited<ReturnType<typeof ElicifyVertexPlugin>>, sessionID: string, text: string) {
  await hooks["experimental.text.complete"]!({
    sessionID,
    messageID: `msg-${sessionID}`,
    partID: `part-${sessionID}`,
  }, { text })
}

describe("final-response promise lifecycle", () => {
  it("clears stale assistant text and evaluates the current completed response", async () => {
    const prompt = vi.fn(async () => ({}))
    const hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    const sessionID = "promise-current"

    await activate(hooks, sessionID, "fix the parser") // normal mode: advisory only
    await completeText(hooks, sessionID, "TODO: I will finish this later.")

    // A new prompt clears the previous response. messages.transform must not
    // repopulate it from history before the current model response.
    await activate(hooks, sessionID, "fix the parser")
    await hooks["experimental.chat.messages.transform"]!({}, {
      messages: [{
        info: { id: "old", sessionID, role: "assistant" } as any,
        parts: [{ type: "text", text: "TODO: stale promise later" } as any],
      }],
    })
    await hooks["tool.execute.after"]!({
      tool: "edit",
      sessionID,
      callID: "edit-1",
      args: { filePath: "src/index.ts" },
    }, { title: "edit", output: "updated", metadata: {} })
    await completeText(hooks, sessionID, "The requested edit is complete.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID } } as any })
    expect(prompt).not.toHaveBeenCalled()

    await activate(hooks, sessionID, "fix the parser")
    await hooks["tool.execute.after"]!({
      tool: "edit",
      sessionID,
      callID: "edit-2",
      args: { filePath: "src/index.ts" },
    }, { title: "edit", output: "updated", metadata: {} })
    await completeText(hooks, sessionID, "TODO: I will add the test later.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID } } as any })
    expect(prompt).toHaveBeenCalledTimes(1)
    const request = (prompt.mock.calls as unknown as Array<[any]>)[0]?.[0]
    expect(request.body.parts[0].text).toContain("vertex:promise-no-act")
  })

  it("does not let an earlier passing verifier excuse promised remaining work", async () => {
    const prompt = vi.fn(async () => ({}))
    const hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    const sessionID = "promise-after-test"
    await activate(hooks, sessionID, "fix the parser")
    await hooks["tool.execute.after"]!({
      tool: "edit",
      sessionID,
      callID: "edit",
      args: { filePath: "src/index.ts" },
    }, { title: "edit", output: "updated", metadata: {} })
    await hooks["tool.execute.after"]!({
      tool: "bash",
      sessionID,
      callID: "verify",
      args: { command: "npm test" },
    }, { title: "tests", output: "217 passed", metadata: { exit: 0 } })
    await completeText(hooks, sessionID, "I will implement the missing cache next.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID } } as any })
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})

describe("mutation observation", () => {
  it.each([
    ["apply_patch", { patchText: "*** Begin Patch\n*** Update File: src/index.ts\n@@\n-old\n+new\n*** End Patch" }],
    ["bash", { command: "mkdir generated" }],
  ])("hard-blocks deep unverified work changed through %s", async (tool, args) => {
    const prompt = vi.fn(async () => ({}))
    const hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    const sessionID = `mutation-${tool}`
    await activate(hooks, sessionID, "deep implement the plan")
    await hooks["tool.execute.after"]!({ tool, sessionID, callID: "change", args }, {
      title: "change",
      output: "done",
      metadata: tool === "bash" ? { exit: 0 } : {},
    })
    await completeText(hooks, sessionID, "Work is complete.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID } } as any })
    expect(prompt).toHaveBeenCalledTimes(1)
    const request = (prompt.mock.calls as unknown as Array<[any]>)[0]?.[0]
    expect(request.body.parts[0].text).toContain("vertex:stop-block")
  })

  it("observes host file.edited events", async () => {
    const prompt = vi.fn(async () => ({}))
    const hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    const sessionID = "file-event"
    await activate(hooks, sessionID, "deep implement the plan")
    await hooks.event!({ event: { type: "file.edited", properties: { file: "src/generated.ts" } } as any })
    await completeText(hooks, sessionID, "Work is complete.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID } } as any })
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it("does not attribute a sessionless file.edited event when several sessions are active", async () => {
    const prompt = vi.fn(async () => ({}))
    const hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    await activate(hooks, "editor", "deep implement the plan")
    await activate(hooks, "innocent", "deep review the plan")
    await hooks.event!({ event: { type: "file.edited", properties: { file: "src/other.ts" } } as any })
    await completeText(hooks, "innocent", "Review complete.")
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID: "innocent" } } as any })
    expect(prompt).not.toHaveBeenCalled()
  })

  it("preserves mutation evidence across a gate-generated continuation prompt", async () => {
    let hooks: Awaited<ReturnType<typeof ElicifyVertexPlugin>>
    const prompt = vi.fn(async (request: any) => {
      await hooks["chat.message"]!({ sessionID: "continuation", agent: "elicify-vertex-agent" } as any, {
        message: {} as any,
        parts: request.body.parts,
      })
      return {}
    })
    hooks = await ElicifyVertexPlugin(pluginInput(prompt), undefined)
    await activate(hooks, "continuation", "deep implement the plan")
    await hooks["tool.execute.after"]!({
      tool: "edit",
      sessionID: "continuation",
      callID: "edit",
      args: { filePath: "src/index.ts" },
    }, { title: "edit", output: "done", metadata: {} })

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await completeText(hooks, "continuation", `Unverified completion attempt ${attempt}.`)
      await hooks.event!({ event: { type: "session.idle", properties: { sessionID: "continuation" } } as any })
      expect(prompt).toHaveBeenCalledTimes(attempt)
    }
  })
})

describe("messages-transform session isolation", () => {
  it("injects each queued directive only into a message from the same session", async () => {
    const hooks = await ElicifyVertexPlugin(pluginInput(), undefined)
    await activate(hooks, "s1", "fix one")
    await activate(hooks, "s2", "fix two")
    hooks.enqueue("s1", { id: "only-s1", text: "private to s1" })
    hooks.enqueue("s2", { id: "only-s2", text: "private to s2" })
    const output = {
      messages: [
        { info: { id: "m1", sessionID: "s1", role: "user" } as any, parts: [] as any[] },
        { info: { id: "m2", sessionID: "s2", role: "user" } as any, parts: [] as any[] },
      ],
    }
    await hooks["experimental.chat.messages.transform"]!({}, output)
    const s1 = output.messages[0].parts.map((part) => part.text).join("\n")
    const s2 = output.messages[1].parts.map((part) => part.text).join("\n")
    expect(s1).toContain("only-s1")
    expect(s1).not.toContain("only-s2")
    expect(s2).toContain("only-s2")
    expect(s2).not.toContain("only-s1")
  })

  it("preserves queued directives across compaction", async () => {
    const hooks = await ElicifyVertexPlugin(pluginInput(), undefined)
    await activate(hooks, "s1", "fix one")
    hooks.enqueue("s1", { id: "after-compaction", text: "deliver after compaction" })
    await hooks["experimental.session.compacting"]!({ sessionID: "s1" }, { context: [] })

    const during = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s1", model: {} as any }, during)
    expect(during.system.join("\n")).not.toContain("after-compaction")

    await hooks.event!({ event: { type: "session.compacted", properties: { sessionID: "s1" } } as any })
    const after = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s1", model: {} as any }, after)
    expect(after.system.join("\n")).toContain("after-compaction")
  })

  it("releases queued directives on the next message when compaction does not complete", async () => {
    const hooks = await ElicifyVertexPlugin(pluginInput(), undefined)
    await activate(hooks, "s1", "fix one")
    hooks.enqueue("s1", { id: "after-failed-compaction", text: "still deliver this" })
    await hooks["experimental.session.compacting"]!({ sessionID: "s1" }, { context: [] })
    const during = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s1", model: {} as any }, during)
    expect(during.system.join("\n")).not.toContain("after-failed-compaction")

    await activate(hooks, "s1", "continue after failed compaction")
    const resumed = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s1", model: {} as any }, resumed)
    expect(resumed.system.join("\n")).toContain("after-failed-compaction")
  })
})

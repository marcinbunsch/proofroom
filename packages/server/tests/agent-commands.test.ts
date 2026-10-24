import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { AgentRunFailed, type AgentRun } from "../src/agents/agent-run.ts"
import { claudeCommand, readClaudeResult } from "../src/agents/claude-cli.ts"
import { codexCommand, readCodexResult } from "../src/agents/codex-cli.ts"

const plannerRun: AgentRun = {
  cli: "claude",
  model: null,
  workingDirectory: "/Users/ada/.proofroom/worktrees/9f3c1e2a7b4d-run",
  prompt: "Plan a guide for pull request 482.",
  toolServer: {
    url: "http://127.0.0.1:52817/mcp/6f1c2b8e-4d3a-4f9e-8b7c-1a2d3e4f5a6b",
    toolNames: ["set_overview", "add_chapter"],
  },
}

// The value that follows a flag in an argument list.
function valueAfter(args: ReadonlyArray<string>, flag: string): string | undefined {
  return args[args.indexOf(flag) + 1]
}

describe("claudeCommand", () => {
  const command = claudeCommand("claude", plannerRun, null)

  it("tool server -> the only MCP server, reached over HTTP", () => {
    assert.deepStrictEqual(JSON.parse(valueAfter(command.args, "--mcp-config") ?? ""), {
      mcpServers: { proofroom: { type: "http", url: plannerRun.toolServer.url } },
    })
    assert.include(command.args, "--strict-mcp-config")
  })

  it("permissions -> the run's tools allowed, no shell, everything else refused unasked", () => {
    assert.includeMembers(
      [...command.args],
      ["mcp__proofroom__set_overview", "mcp__proofroom__add_chapter"],
    )
    assert.notInclude(command.args, "Write")
    assert.isFalse(command.args.some((arg) => arg.startsWith("Bash")))
    assert.strictEqual(valueAfter(command.args, "--tools"), "Read,Grep,Glob")
    assert.strictEqual(valueAfter(command.args, "--permission-mode"), "dontAsk")
    assert.strictEqual(valueAfter(command.args, "--permission-prompts"), "none")
    assert.strictEqual(valueAfter(command.args, "--setting-sources"), "")
  })

  it("prompt and checkout -> prompt on stdin, run inside the checkout", () => {
    assert.strictEqual(command.stdin, "Plan a guide for pull request 482.")
    assert.strictEqual(command.cwd, plannerRun.workingDirectory)
    assert.notInclude(command.args, plannerRun.prompt)
  })

  it("model chosen -> passed on; no model -> the CLI's default", () => {
    const withModel = claudeCommand("claude", { ...plannerRun, model: "claude-opus-5-5" }, null)
    assert.strictEqual(valueAfter(withModel.args, "--model"), "claude-opus-5-5")
    assert.notInclude(command.args, "--model")
  })

  it("account folder given -> run as that account; none -> Claude Code's default", () => {
    const asWorkAccount = claudeCommand("claude", plannerRun, "/Users/ada/.claude-work")
    assert.deepStrictEqual(asWorkAccount.env, { CLAUDE_CONFIG_DIR: "/Users/ada/.claude-work" })
    assert.strictEqual(command.env, undefined)
  })
})

describe("readClaudeResult", () => {
  it.effect("successful run -> its last message and cost", () =>
    Effect.gen(function* () {
      const result = yield* readClaudeResult(
        JSON.stringify({
          type: "result",
          is_error: false,
          result: "Plan accepted.",
          total_cost_usd: 0.0875,
        }),
      )
      assert.deepStrictEqual(result, { finalMessage: "Plan accepted.", costUsd: 0.0875 })
    }),
  )

  it.effect("run that ended in an error -> AgentRunFailed with Claude's message", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        readClaudeResult(
          JSON.stringify({ type: "result", is_error: true, result: "Reached max turns" }),
        ),
      )
      assert.deepStrictEqual(
        exit,
        Exit.fail(
          new AgentRunFailed({ message: "Claude Code stopped with an error: Reached max turns" }),
        ),
      )
    }),
  )
})

describe("codexCommand", () => {
  const command = codexCommand(
    "codex",
    { ...plannerRun, cli: "codex" },
    { codexHome: "/Users/ada/.codex-work", emptyHome: "/Users/ada/.proofroom/agent-home" },
  )

  it("sandbox and approvals -> read-only, and the tool server's tools approved up front", () => {
    assert.strictEqual(valueAfter(command.args, "--sandbox"), "read-only")
    assert.includeMembers(
      [...command.args],
      [
        'approval_policy="never"',
        `mcp_servers.proofroom.url="${plannerRun.toolServer.url}"`,
        'mcp_servers.proofroom.default_tools_approval_mode="approve"',
        'web_search="disabled"',
        "features.memories=false",
        "features.hooks=false",
      ],
    )
    assert.includeMembers(
      [...command.args],
      ["--ignore-user-config", "--ignore-rules", "--ephemeral"],
    )
  })

  it("folders -> an empty home folder, and the account's own Codex folder for the login", () => {
    assert.deepStrictEqual(command.env, {
      HOME: "/Users/ada/.proofroom/agent-home",
      CODEX_HOME: "/Users/ada/.codex-work",
    })
  })

  it("prompt -> read from stdin", () => {
    assert.strictEqual(command.args.at(-1), "-")
    assert.strictEqual(command.stdin, plannerRun.prompt)
  })
})

describe("readCodexResult", () => {
  // Shaped like what Codex 0.153.0 printed in the spike.
  const events = (...lines: Array<object>) => lines.map((line) => JSON.stringify(line)).join("\n")

  it.effect("finished turn -> the last agent message", () =>
    Effect.gen(function* () {
      const result = yield* readCodexResult(
        events(
          { type: "thread.started" },
          { type: "item.completed", item: { type: "agent_message", text: "Reading the diff." } },
          { type: "item.completed", item: { type: "mcp_tool_call", status: "completed" } },
          { type: "item.completed", item: { type: "agent_message", text: "Plan accepted." } },
          { type: "turn.completed", usage: { input_tokens: 57125 } },
        ),
      )
      assert.deepStrictEqual(result, { finalMessage: "Plan accepted.", costUsd: null })
    }),
  )

  it.effect("failed turn -> AgentRunFailed with Codex's message", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        readCodexResult(events({ type: "turn.failed", error: { message: "stream disconnected" } })),
      )
      assert.deepStrictEqual(
        exit,
        Exit.fail(
          new AgentRunFailed({ message: "Codex stopped with an error: stream disconnected" }),
        ),
      )
    }),
  )
})

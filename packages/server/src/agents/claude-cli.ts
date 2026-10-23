import { Effect, Schema } from "effect"
import type { Command } from "../process/run-command.ts"
import { AgentRunFailed, type AgentRun, type AgentRunResult } from "./agent-run.ts"

// How a guide run drives Claude Code: the exact command line, and how to read
// what it prints when it's done.
//
// The flags are what keeps a run from ever stopping to ask permission, and
// from doing anything but reading. They were tested on Claude Code 2.1.280;
// BOOTSTRAP.md records what each one is for.

// Commands an agent may run to learn why code is the way it is. Anything not
// listed is refused without asking.
const readOnlyCommands = ["git log", "git show", "git blame", "git grep", "rg", "ls"]

// Proofroom's tool server is registered under this name, so its tools reach
// the agent as `mcp__proofroom__<tool>`.
const toolServerName = "proofroom"

export function claudeCommand(executable: string, run: AgentRun): Command {
  const mcpConfig = { mcpServers: { [toolServerName]: { type: "http", url: run.toolServer.url } } }
  const allowedTools = [
    ...run.toolServer.toolNames.map((toolName) => `mcp__${toolServerName}__${toolName}`),
    ...readOnlyCommands.map((command) => `Bash(${command}:*)`),
  ]
  return {
    executable,
    args: [
      "--print",
      "--mcp-config",
      JSON.stringify(mcpConfig),
      "--strict-mcp-config",
      // The user's own settings, hooks and allow-lists stay out of the run.
      "--setting-sources",
      "",
      "--tools",
      "Read,Grep,Glob,Bash",
      "--allowedTools",
      ...allowedTools,
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--no-session-persistence",
      "--output-format",
      "json",
      ...(run.model === null ? [] : ["--model", run.model]),
    ],
    cwd: run.workingDirectory,
    stdin: run.prompt,
  }
}

// What `--output-format json` prints once the run ends. It prints more; only
// these fields are read.
const ClaudeResult = Schema.Struct({
  is_error: Schema.Boolean,
  result: Schema.optional(Schema.String),
  total_cost_usd: Schema.optional(Schema.Number),
})

export function readClaudeResult(stdout: string): Effect.Effect<AgentRunResult, AgentRunFailed> {
  return Schema.decodeUnknownEffect(Schema.fromJsonString(ClaudeResult))(stdout).pipe(
    Effect.mapError(
      (error) =>
        new AgentRunFailed({
          message: `Claude Code printed something unexpected: ${error.message}`,
        }),
    ),
    Effect.flatMap((result) => {
      const finalMessage = result.result ?? ""
      if (result.is_error) {
        return Effect.fail(
          new AgentRunFailed({ message: `Claude Code stopped with an error: ${finalMessage}` }),
        )
      }
      return Effect.succeed({ finalMessage, costUsd: result.total_cost_usd ?? null })
    }),
  )
}

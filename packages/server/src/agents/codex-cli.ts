import { homedir } from "node:os"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import type { Command } from "../process/run-command.ts"
import { AgentRunFailed, type AgentRun, type AgentRunResult } from "./agent-run.ts"

// How a guide run drives Codex: the exact command line, and how to read the
// events it prints. Tested on Codex 0.153.0; BOOTSTRAP.md records what each
// setting is for.
//
// Codex's read-only sandbox is what stops writes and network use. Everything
// else here keeps the run from asking permission, and keeps the user's own
// setup (skills, memories, hooks, plugins) out of it.

export function codexCommand(executable: string, run: AgentRun, emptyHome: string): Command {
  return {
    executable,
    args: [
      "exec",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--cd",
      run.workingDirectory,
      ...configFlags({
        approval_policy: "never",
        // Without approving the tool server's tools up front, Codex refuses
        // every call to them when it may not ask.
        "mcp_servers.proofroom.url": run.toolServer.url,
        "mcp_servers.proofroom.default_tools_approval_mode": "approve",
        web_search: "disabled",
        "features.memories": false,
        "features.hooks": false,
        "features.plugins": false,
        "features.apps": false,
      }),
      ...(run.model === null ? [] : ["--model", run.model]),
      // "-": read the prompt from stdin.
      "-",
    ],
    cwd: run.workingDirectory,
    env: {
      // --ignore-user-config still lets Codex load personal skills from the
      // home folder, so it gets an empty one. CODEX_HOME keeps pointing at the
      // real Codex folder, where the user's login lives.
      HOME: emptyHome,
      CODEX_HOME: process.env.CODEX_HOME || join(homedir(), ".codex"),
    },
    stdin: run.prompt,
  }
}

// Codex takes settings as `-c key=value`, with the value written as TOML.
// JSON strings and booleans are valid TOML, so JSON.stringify writes them.
function configFlags(settings: Record<string, string | boolean>): Array<string> {
  return Object.entries(settings).flatMap(([key, value]) => [
    "-c",
    `${key}=${JSON.stringify(value)}`,
  ])
}

// The events `codex exec --json` prints, one JSON object per line. Only the
// fields Proofroom reads are listed; there are many more.
const CodexEvent = Schema.Struct({
  type: Schema.String,
  item: Schema.optional(
    Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }),
  ),
  message: Schema.optional(Schema.String),
  error: Schema.optional(Schema.Struct({ message: Schema.optional(Schema.String) })),
})
type CodexEvent = typeof CodexEvent.Type

export function readCodexResult(stdout: string): Effect.Effect<AgentRunResult, AgentRunFailed> {
  const lines = stdout.split("\n").filter((line) => line.trim() !== "")
  return Effect.forEach(lines, (line) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(CodexEvent))(line),
  ).pipe(
    Effect.mapError(
      (error) =>
        new AgentRunFailed({ message: `Codex printed something unexpected: ${error.message}` }),
    ),
    Effect.flatMap((events) => {
      const failure = events.find(isFailure)
      if (failure !== undefined) {
        return Effect.fail(
          new AgentRunFailed({
            message: `Codex stopped with an error: ${failureMessage(failure)}`,
          }),
        )
      }
      return Effect.succeed({ finalMessage: lastAgentMessage(events), costUsd: null })
    }),
  )
}

const isFailure = (event: CodexEvent) => event.type === "turn.failed" || event.type === "error"

function failureMessage(event: CodexEvent): string {
  return event.error?.message ?? event.message ?? "no details"
}

function lastAgentMessage(events: ReadonlyArray<CodexEvent>): string {
  const agentMessages = events.filter(
    (event) => event.type === "item.completed" && event.item?.type === "agent_message",
  )
  return agentMessages.at(-1)?.item?.text ?? ""
}

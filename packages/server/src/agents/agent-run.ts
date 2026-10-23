import type { AgentCli } from "@proofroom/protocol"
import { Schema } from "effect"
import type { ToolServer } from "./tool-server.ts"

// One run of an agent CLI: what it is asked, where it reads code from, and
// the tool server it hands its work back through.

export interface AgentRun {
  readonly cli: AgentCli
  // null: whatever the CLI uses by default.
  readonly model: string | null
  // The checkout the agent reads. It can't write here or anywhere else.
  readonly workingDirectory: string
  readonly prompt: string
  readonly toolServer: ToolServer
}

export interface AgentRunResult {
  // The agent's last message. The work itself arrives through the tool
  // server; this is kept for logs and failure messages.
  readonly finalMessage: string
  // Claude Code reports what a run cost; Codex doesn't.
  readonly costUsd: number | null
}

export class AgentRunFailed extends Schema.TaggedError<AgentRunFailed>()("AgentRunFailed", {
  message: Schema.String,
}) {}

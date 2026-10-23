import { Effect, Layer } from "effect"
import { AgentRunnerService } from "../../src/agents/AgentRunnerService.ts"
import type { AgentRun, AgentRunFailed } from "../../src/agents/agent-run.ts"
import { AgentClient } from "./AgentClient.ts"

// An agent runner that plays the agent from a script instead of running a CLI.
// The script talks to the run's real tool server through the MCP client, so
// everything behind the tools (checks, storage, the coverage rule) is real.

// Plays one run. Returns the agent's last message, or fails as a CLI would.
export type AgentScript = (
  agent: AgentClient,
  run: AgentRun,
) => Effect.Effect<string, AgentRunFailed>

export interface AgentScripts {
  readonly planner: AgentScript
  readonly chapter: AgentScript
}

export function fakeAgentRunner(scripts: AgentScripts) {
  return Layer.succeed(
    AgentRunnerService,
    AgentRunnerService.of({
      run: (run) =>
        Effect.gen(function* () {
          const agent = yield* AgentClient.connect(run.toolServer.url)
          const isPlannerRun = run.toolServer.toolNames.includes("finish_plan")
          const finalMessage = yield* (isPlannerRun ? scripts.planner : scripts.chapter)(agent, run)
          return { finalMessage, costUsd: null }
        }).pipe(Effect.scoped),
    }),
  )
}

// The hunk ids an agent finds in its prompt, by file. The planner's prompt
// lists every hunk as "<id>  <path>  ..."; a chapter prompt heads each of its
// hunks with "### <id>  <path>  ...".
export function hunkIdsByPath(prompt: string): Map<string, string> {
  const hunkIds = new Map<string, string>()
  for (const match of prompt.matchAll(/^(?:### )?(h[0-9a-f]{10})  (\S+)/gm)) {
    const [, hunkId, path] = match
    if (hunkId !== undefined && path !== undefined) hunkIds.set(path, hunkId)
  }
  return hunkIds
}

// The chapter a chapter run was asked to write, from its prompt's heading.
export function chapterTitleIn(prompt: string): string {
  return /^# Your chapter: (.+)$/m.exec(prompt)?.[1] ?? ""
}

import { mkdir } from "node:fs/promises"
import { Context, Effect, Layer } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { AppPaths } from "../AppPaths.ts"
import { runCommand } from "../process/run-command.ts"
import { AgentConfigFolders } from "./AgentConfigFolders.ts"
import { AgentExecutables } from "./AgentExecutables.ts"
import { AgentRunFailed, type AgentRun, type AgentRunResult } from "./agent-run.ts"
import { claudeCommand, readClaudeResult } from "./claude-cli.ts"
import { codexCommand, readCodexResult } from "./codex-cli.ts"

// Runs one agent CLI to completion. The run's real output arrives through its
// tool server while it works; what comes back here is how it ended.
//
// Interrupting a run (a guide being cancelled) stops the CLI: the process is
// tied to the run's scope.
//
// Each CLI runs as the account in AgentConfigFolders.
//
// Tests replace this service with a fake agent, so the pipeline can be tested
// without running an AI.

export interface AgentRunner {
  readonly run: (agentRun: AgentRun) => Effect.Effect<AgentRunResult, AgentRunFailed>
}

export class AgentRunnerService extends Context.Service<AgentRunnerService, AgentRunner>()(
  "proofroom/agents/AgentRunnerService",
) {
  static readonly layer = Layer.effect(AgentRunnerService, makeAgentRunnerService())
}

// A function declaration, so the layer above can use it before this line.
function makeAgentRunnerService() {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const paths = yield* AppPaths
    const executables = yield* AgentExecutables
    const configFolders = yield* AgentConfigFolders

    const runClaude = (agentRun: AgentRun) =>
      runCommand(
        spawner,
        claudeCommand(executables.claude, agentRun, configFolders.claudeConfigDir),
      ).pipe(
        Effect.mapError((error) => new AgentRunFailed({ message: error.message })),
        Effect.flatMap(readClaudeResult),
      )

    const runCodex = (agentRun: AgentRun) =>
      Effect.promise(() => mkdir(paths.agentHome, { recursive: true })).pipe(
        Effect.andThen(
          runCommand(
            spawner,
            codexCommand(executables.codex, agentRun, {
              codexHome: configFolders.codexHome,
              emptyHome: paths.agentHome,
            }),
          ),
        ),
        Effect.mapError((error) => new AgentRunFailed({ message: error.message })),
        Effect.flatMap(readCodexResult),
      )

    const run = (agentRun: AgentRun) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("agent run started", { cli: agentRun.cli, model: agentRun.model })
        const result = yield* agentRun.cli === "claude" ? runClaude(agentRun) : runCodex(agentRun)
        yield* Effect.logInfo("agent run finished", { cli: agentRun.cli, costUsd: result.costUsd })
        return result
      }).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("agent run failed", { message: error.message }),
        ),
      )

    return AgentRunnerService.of({ run })
  })
}

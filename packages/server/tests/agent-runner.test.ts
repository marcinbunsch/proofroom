import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { AppPaths } from "../src/AppPaths.ts"
import { AgentExecutables } from "../src/agents/AgentExecutables.ts"
import { AgentRunnerService } from "../src/agents/AgentRunnerService.ts"
import { AgentRunFailed, type AgentRun } from "../src/agents/agent-run.ts"
import { StandInCli } from "./fixtures/StandInCli.ts"
import { realProcessesTimeout } from "./fixtures/timeouts.ts"

describe("AgentRunnerService", realProcessesTimeout, () => {
  let workspace = ""
  let checkout = ""
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "proofroom-agent-runner-")))
    checkout = join(workspace, "checkout")
    mkdirSync(checkout)
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // The real runner, starting a stand-in script instead of the real CLI.
  function runnerLayer(standIn: StandInCli) {
    return AgentRunnerService.layer.pipe(
      Layer.provide(
        Layer.succeed(AgentExecutables, { claude: standIn.executable, codex: standIn.executable }),
      ),
      Layer.provide(AppPaths.fromHome(join(workspace, "home"))),
      Layer.provide(NodeServices.layer),
    )
  }

  function chapterRun(cli: AgentRun["cli"]): AgentRun {
    return {
      cli,
      model: null,
      workingDirectory: checkout,
      prompt: "Write the chapter on rounding in cartTotal.",
      toolServer: { url: "http://127.0.0.1:52817/mcp/run", toolNames: ["write_chapter"] },
    }
  }

  it.effect(
    "claude run -> started in the checkout with the prompt on stdin, result read back",
    () => {
      const standIn = StandInCli.create(join(workspace, "claude"), {
        output: JSON.stringify({
          is_error: false,
          result: "Chapter finished.",
          total_cost_usd: 0.0412,
        }),
      })
      return Effect.gen(function* () {
        const runner = yield* AgentRunnerService

        const result = yield* runner.run(chapterRun("claude"))

        const started = standIn.recordedStart()
        assert.deepStrictEqual(result, { finalMessage: "Chapter finished.", costUsd: 0.0412 })
        assert.strictEqual(started.stdin, "Write the chapter on rounding in cartTotal.")
        assert.strictEqual(started.workingDirectory, checkout)
        assert.include(started.args, "mcp__proofroom__write_chapter")
      }).pipe(Effect.provide(runnerLayer(standIn)))
    },
  )

  it.effect("codex run -> started with the empty home folder, which is created first", () => {
    const standIn = StandInCli.create(join(workspace, "codex"), {
      output: JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "Chapter finished." },
      }),
    })
    return Effect.gen(function* () {
      const runner = yield* AgentRunnerService

      const result = yield* runner.run(chapterRun("codex"))

      assert.deepStrictEqual(result, { finalMessage: "Chapter finished.", costUsd: null })
      assert.strictEqual(standIn.recordedStart().home, join(workspace, "home", "agent-home"))
    }).pipe(Effect.provide(runnerLayer(standIn)))
  })

  it.effect("CLI exits with an error -> AgentRunFailed carrying what it printed to stderr", () => {
    const standIn = StandInCli.create(join(workspace, "claude"), { output: "", exitCode: 1 })
    return Effect.gen(function* () {
      const runner = yield* AgentRunnerService

      const error = yield* Effect.flip(runner.run(chapterRun("claude")))

      assert.instanceOf(error, AgentRunFailed)
      assert.include(error.message, "exited with 1")
    }).pipe(Effect.provide(runnerLayer(standIn)))
  })
})

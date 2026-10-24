import { HistoryToolkit, PlannerToolkit, type AgentCli, type GuideId } from "@proofroom/protocol"
import { Deferred, Effect, Layer, Schema } from "effect"
import { McpServer } from "effect/ai"
import { AgentRunnerService } from "../../agents/AgentRunnerService.ts"
import { serveTools } from "../../agents/tool-server.ts"
import { historyToolHandlers } from "../history-tools.ts"
import type { LoadedPullRequest } from "../../pull-requests/PullRequestService.ts"
import { plannerPrompt } from "./planner-prompt.ts"
import { plannerToolHandlers } from "./planner-tools.ts"

export class PlanningFailed extends Schema.TaggedError<PlanningFailed>()("PlanningFailed", {
  message: Schema.String,
}) {}

export interface PlannerInput {
  readonly guideId: GuideId
  readonly pullRequest: LoadedPullRequest
  // The checkout of the pull request's head the agent reads from.
  readonly checkout: string
  readonly cli: AgentCli
}

// 30 minutes: planning a very large pull request means reading thousands of
// lines; a run still going after this long is stuck, not thorough.
const plannerTimeLimit = "30 minutes"

// Runs the planner from start to finish:
//
// 1. Serve the planner's tools for this guide.
// 2. Start the agent CLI with the planner prompt, and wait for it to exit.
// 3. Check the plan was accepted. The agent's own word isn't enough: only a
//    finish_plan call that passed the coverage check counts.
//
// The tool server shuts down when this returns.
export function runPlanner(input: PlannerInput) {
  return Effect.gen(function* () {
    const runner = yield* AgentRunnerService
    const planAccepted = yield* Deferred.make<void>()
    const toolServer = yield* servePlannerTools(input, planAccepted)

    const result = yield* runner
      .run({
        cli: input.cli,
        model: null,
        workingDirectory: input.checkout,
        prompt: plannerPrompt(input.pullRequest),
        toolServer,
      })
      .pipe(
        Effect.timeoutOrElse({
          duration: plannerTimeLimit,
          orElse: () =>
            Effect.fail(
              new PlanningFailed({ message: `The planner ran for over ${plannerTimeLimit}.` }),
            ),
        }),
      )

    const isPlanAccepted = yield* Deferred.isDone(planAccepted)
    if (!isPlanAccepted) {
      return yield* new PlanningFailed({
        message: `The planner stopped before its plan was complete. Its last message: ${result.finalMessage}`,
      })
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTags({
      AgentRunFailed: (error) => Effect.fail(new PlanningFailed({ message: error.message })),
      ServeError: () =>
        Effect.fail(new PlanningFailed({ message: "The planner's tool server didn't start." })),
    }),
  )
}

function servePlannerTools(input: PlannerInput, planAccepted: Deferred.Deferred<void>) {
  return Effect.gen(function* () {
    const handlers = yield* Layer.build(
      Layer.merge(
        plannerToolHandlers({
          guideId: input.guideId,
          hunks: input.pullRequest.hunks,
          planAccepted,
        }),
        historyToolHandlers(input.checkout),
      ),
    )
    const tools = Layer.merge(
      McpServer.toolkit(PlannerToolkit),
      McpServer.toolkit(HistoryToolkit),
    ).pipe(Layer.provide(Layer.succeedContext(handlers)))
    return yield* serveTools(tools, [
      ...Object.keys(PlannerToolkit.tools),
      ...Object.keys(HistoryToolkit.tools),
    ])
  })
}

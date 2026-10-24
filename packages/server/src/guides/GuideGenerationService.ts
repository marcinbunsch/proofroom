import type { AgentCli, Chapter, GuideId } from "@proofroom/protocol"
import { Cause, Context, Effect, Exit, FiberSet, Layer } from "effect"
import type { AgentRunnerService } from "../agents/AgentRunnerService.ts"
import {
  PullRequestService,
  type LoadFailed,
  type LoadedPullRequest,
} from "../pull-requests/PullRequestService.ts"
import { GuideMutationService } from "../storage/guides/GuideMutationService.ts"
import { GuideQueryService } from "../storage/guides/GuideQueryService.ts"
import { runChapter, type ChapterInput } from "./chapters/run-chapter.ts"
import { runPlanner } from "./planning/run-planner.ts"

// Makes a guide for a pull request.
//
// start() loads the pull request and creates the guide, then returns its id
// straight away; the guide is written in the background while the UI watches
// it fill in. Writing a guide is:
//
// 1. Check out the pull request's head for the agents to read.
// 2. The planner writes the overview and the outline, and places every hunk.
// 3. One run per chapter writes it, three at a time.
// 4. The guide is done, or failed, with the reason saved for the reader.
//
// A chapter that fails doesn't fail the guide: its status says why, and the
// other chapters are still worth reading.
//
// The layer brings PullRequestService. Storage, GitHub and the agent runner
// are left for the caller, so the app and the tests can share one storage
// wiring and swap the agent.

export interface GuideGeneration {
  readonly start: (pullRequestUrl: string, cli: AgentCli) => Effect.Effect<GuideId, LoadFailed>
}

export class GuideGenerationService extends Context.Service<
  GuideGenerationService,
  GuideGeneration
>()("proofroom/guides/GuideGenerationService") {
  static readonly layer = Layer.effect(GuideGenerationService, makeGuideGenerationService()).pipe(
    Layer.provide(PullRequestService.layer),
  )
}

// Three at a time: chapter runs are independent, and more at once would mostly
// queue behind the AI provider's rate limits while using the laptop's memory.
const chapterRunsAtOnce = 3

// A function declaration, so the layer above can use it before this line.
function makeGuideGenerationService() {
  return Effect.gen(function* () {
    const pullRequests = yield* PullRequestService
    const mutations = yield* GuideMutationService
    const queries = yield* GuideQueryService
    const writingServices = yield* Effect.context<GuideWritingServices>()
    // Guides being written. They stop when the app shuts down.
    const guidesBeingWritten = yield* FiberSet.make()

    const start = (pullRequestUrl: string, cli: AgentCli) =>
      Effect.gen(function* () {
        const pullRequest = yield* pullRequests.load(pullRequestUrl)
        const guideId = yield* mutations.createGuide({
          pullRequest: pullRequest.pullRequest,
          title: pullRequest.title,
          headSha: pullRequest.headSha,
          mergeBaseSha: pullRequest.mergeBaseSha,
          cli,
        })
        yield* mutations.saveHunks(guideId, pullRequest.hunks)
        yield* FiberSet.run(
          guidesBeingWritten,
          writeGuide(guideId, pullRequest, cli).pipe(Effect.provideContext(writingServices)),
        )
        return guideId
      })

    const writeGuide = (guideId: GuideId, pullRequest: LoadedPullRequest, cli: AgentCli) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("writing guide", { guideId, pullRequest: pullRequest.pullRequest })
        const checkout = yield* pullRequests.checkOutHead(pullRequest)

        yield* runPlanner({ guideId, pullRequest, checkout, cli })
        yield* mutations.setGuideStatus(guideId, "writing", null)

        const plannedGuide = yield* queries.loadGuide(guideId)
        const writeChapter = (chapter: Chapter) =>
          writeChapterAndRecordOutcome({
            guideId,
            pullRequest,
            guide: plannedGuide,
            chapter,
            checkout,
            cli,
          })
        yield* Effect.forEach(plannedGuide.chapters, writeChapter, {
          concurrency: chapterRunsAtOnce,
        })

        yield* mutations.setGuideStatus(guideId, "done", null)
        yield* Effect.logInfo("guide done", { guideId })
      }).pipe(
        Effect.scoped,
        Effect.catchCause((cause) => recordGuideFailure(guideId, cause)),
      )

    // The chapter is marked as being written while its run goes, then as done
    // or failed with the reason. A chapter that fails for any reason, even a
    // bug, only fails itself.
    const writeChapterAndRecordOutcome = (input: ChapterInput) =>
      Effect.gen(function* () {
        const { guideId, chapter } = input
        yield* mutations.setChapterStatus(guideId, chapter.key, "writing", null)
        const outcome = yield* Effect.exit(runChapter(input))
        if (Exit.isSuccess(outcome)) {
          yield* mutations.setChapterStatus(guideId, chapter.key, "done", null)
          return
        }
        const reason = failureReason(outcome.cause)
        yield* mutations.setChapterStatus(guideId, chapter.key, "failed", reason)
        yield* Effect.logWarning("chapter failed", { guideId, chapter: chapter.key, reason })
      })

    // Anything that stops a guide, an expected failure or a bug, ends up here
    // and is saved on the guide, so the reader sees why it stopped.
    const recordGuideFailure = (guideId: GuideId, cause: Cause.Cause<unknown>) => {
      const reason = failureReason(cause)
      return mutations
        .setGuideStatus(guideId, "failed", reason)
        .pipe(Effect.andThen(Effect.logWarning("guide failed", { guideId, reason })))
    }

    return GuideGenerationService.of({ start })
  })
}

// The services the planner and chapter runs use. They are captured when this
// service is built and handed to each guide written in the background, so the
// background work uses the same storage and agent runner as the rest of the
// app.
type GuideWritingServices = AgentRunnerService | GuideMutationService | GuideQueryService

function failureReason(cause: Cause.Cause<unknown>): string {
  const failure = Cause.findErrorOption(cause)
  if (failure._tag === "Some" && failure.value instanceof Error) return failure.value.message
  if (Cause.hasInterrupts(cause)) return "Stopped before it finished."
  return `Something went wrong inside Proofroom: ${Cause.pretty(cause)}`
}

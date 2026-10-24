import {
  ChapterToolkit,
  type AgentCli,
  type Chapter,
  type Guide,
  type GuideId,
} from "@proofroom/protocol"
import { Deferred, Effect, Layer, Schema } from "effect"
import { McpServer } from "effect/ai"
import { AgentRunnerService } from "../../agents/AgentRunnerService.ts"
import { serveTools } from "../../agents/tool-server.ts"
import type { LoadedPullRequest } from "../../pull-requests/PullRequestService.ts"
import { chapterPrompt, type PlacedHunk } from "./chapter-prompt.ts"
import { chapterToolHandlers } from "./chapter-tools.ts"

export class ChapterFailed extends Schema.TaggedError<ChapterFailed>()("ChapterFailed", {
  message: Schema.String,
}) {}

export interface ChapterInput {
  readonly guideId: GuideId
  readonly pullRequest: LoadedPullRequest
  // The planned guide: the outline every chapter is written against.
  readonly guide: Guide
  readonly chapter: Chapter
  readonly checkout: string
  readonly cli: AgentCli
}

// 20 minutes: a chapter covers a slice of the pull request, so a run still
// going after this long is stuck.
const chapterTimeLimit = "20 minutes"

// Writes one chapter from start to finish:
//
// 1. Serve the chapter's tools, which only accept flags on its own hunks.
// 2. Start the agent CLI with the chapter prompt, and wait for it to exit.
// 3. Check finish_chapter was called after the chapter got its text.
export function runChapter(input: ChapterInput) {
  return Effect.gen(function* () {
    const runner = yield* AgentRunnerService
    const placedHunks = hunksPlacedIn(input)
    const chapterFinished = yield* Deferred.make<void>()
    const toolServer = yield* serveChapterTools(input, placedHunks, chapterFinished)

    const result = yield* runner
      .run({
        cli: input.cli,
        model: null,
        workingDirectory: input.checkout,
        prompt: chapterPrompt({ ...input, placedHunks }),
        toolServer,
      })
      .pipe(
        Effect.timeoutOrElse({
          duration: chapterTimeLimit,
          orElse: () =>
            Effect.fail(
              new ChapterFailed({ message: `Writing the chapter took over ${chapterTimeLimit}.` }),
            ),
        }),
      )

    const isFinished = yield* Deferred.isDone(chapterFinished)
    if (!isFinished) {
      return yield* new ChapterFailed({
        message: `The chapter run stopped before finishing. Its last message: ${result.finalMessage}`,
      })
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTags({
      AgentRunFailed: (error) => Effect.fail(new ChapterFailed({ message: error.message })),
      ServeError: () =>
        Effect.fail(new ChapterFailed({ message: "The chapter's tool server didn't start." })),
    }),
  )
}

// The hunks, or parts of hunks, the planner placed in this chapter. Walking
// the diff's hunks in order keeps them in the order the diff shows them.
function hunksPlacedIn(input: ChapterInput): Array<PlacedHunk> {
  const placementsHere = input.guide.placements.filter(
    (placement) =>
      placement.target._tag === "chapter" && placement.target.chapterKey === input.chapter.key,
  )
  return input.pullRequest.hunks.flatMap((hunk) =>
    placementsHere
      .filter((placement) => placement.hunkId === hunk.id)
      .map((placement) => ({ hunk, lines: placement.lines })),
  )
}

function serveChapterTools(
  input: ChapterInput,
  placedHunks: ReadonlyArray<PlacedHunk>,
  chapterFinished: Deferred.Deferred<void>,
) {
  return Effect.gen(function* () {
    const handlers = yield* Layer.build(
      chapterToolHandlers({
        guideId: input.guideId,
        chapterKey: input.chapter.key,
        hunks: placedHunks.map((placed) => placed.hunk),
        chapterFinished,
      }),
    )
    const tools = McpServer.toolkit(ChapterToolkit).pipe(
      Layer.provide(Layer.succeedContext(handlers)),
    )
    return yield* serveTools(tools, Object.keys(ChapterToolkit.tools))
  })
}

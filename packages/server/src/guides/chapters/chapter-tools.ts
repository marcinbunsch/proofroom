import {
  ChapterToolkit,
  ToolRejected,
  type AddFlag,
  type ChapterKey,
  type GuideId,
  type Hunk,
  type HunkId,
  type WriteChapter,
} from "@proofroom/protocol"
import { Deferred, Effect } from "effect"
import type { Tool } from "effect/ai"
import { GuideMutationService } from "../../storage/guides/GuideMutationService.ts"
import { GuideQueryService } from "../../storage/guides/GuideQueryService.ts"
import { checkDiagram } from "../diagrams.ts"

// The tools for writing one chapter. As with the planner's tools, every call
// is checked before anything is saved, and the database is the only record of
// what the run has done.

export interface ChapterRun {
  readonly guideId: GuideId
  readonly chapterKey: ChapterKey
  // The hunks placed in this chapter. Flags may only point into these.
  readonly hunks: ReadonlyArray<Hunk>
  // Completed by finish_chapter once the chapter has text.
  readonly chapterFinished: Deferred.Deferred<void>
}

export function chapterToolHandlers(run: ChapterRun) {
  return ChapterToolkit.toLayer(
    Effect.gen(function* () {
      const context: ChapterContext = {
        run,
        hunksById: new Map(run.hunks.map((hunk) => [hunk.id, hunk])),
        queries: yield* GuideQueryService,
        mutations: yield* GuideMutationService,
      }
      return {
        write_chapter: (parameters) => writeChapter(context, parameters),
        add_flag: (parameters) => addFlag(context, parameters),
        finish_chapter: () => finishChapter(context),
      }
    }),
  )
}

interface ChapterContext {
  readonly run: ChapterRun
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
  readonly queries: GuideQueryService["Service"]
  readonly mutations: GuideMutationService["Service"]
}

// --- the tools ---------------------------------------------------------------------

function writeChapter(
  context: ChapterContext,
  { body, diagram }: Tool.Parameters<typeof WriteChapter>,
) {
  return Effect.gen(function* () {
    if (body.trim() === "")
      return yield* new ToolRejected({ message: "The chapter text is empty." })
    yield* checkDiagram(diagram)
    yield* context.mutations.writeChapter(context.run.guideId, context.run.chapterKey, {
      body,
      diagram,
    })
    return "Chapter saved."
  })
}

function addFlag(context: ChapterContext, flag: Tool.Parameters<typeof AddFlag>) {
  return Effect.gen(function* () {
    const hunk = context.hunksById.get(flag.hunkId)
    if (hunk === undefined) {
      return yield* new ToolRejected({
        message: `${flag.hunkId} is not one of this chapter's hunks.`,
      })
    }
    const isLineInside = 1 <= flag.line && flag.line <= hunk.lines.length
    if (!isLineInside) {
      return yield* new ToolRejected({
        message: `${flag.hunkId} has ${hunk.lines.length} lines; line ${flag.line} is out of range.`,
      })
    }
    yield* context.mutations.addFlag(context.run.guideId, context.run.chapterKey, flag)
    return "Flag saved."
  })
}

function finishChapter(context: ChapterContext) {
  return Effect.gen(function* () {
    const chapter = yield* loadChapter(context)
    if (chapter.body === null)
      return yield* new ToolRejected({ message: "Call write_chapter first." })

    yield* Deferred.succeed(context.run.chapterFinished, undefined)
    return "Chapter finished. You are done; stop now."
  })
}

// The guide and chapter are always there while the chapter is written; a
// missing one is a bug.
function loadChapter(context: ChapterContext) {
  const { guideId, chapterKey } = context.run
  return context.queries.loadGuide(guideId).pipe(
    Effect.orDie,
    Effect.flatMap((guide) => {
      const chapter = guide.chapters.find((candidate) => candidate.key === chapterKey)
      if (chapter === undefined)
        return Effect.die(`chapter "${chapterKey}" is missing from guide ${guideId}`)
      return Effect.succeed(chapter)
    }),
  )
}

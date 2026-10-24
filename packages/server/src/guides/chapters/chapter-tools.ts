import {
  ChapterToolkit,
  ToolRejected,
  type AddFlag,
  type ChapterKey,
  type GuideId,
  type Hunk,
  type HunkId,
  type HunkLineRange,
  type ShowCode,
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
        show_code: (parameters) => showCode(context, parameters),
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

// The chapter points the reader at a few lines worth their focus; everything
// else is on the Diff tab. The limits keep it to a few short excerpts, so the
// guide doesn't turn back into the diff.
function showCode(context: ChapterContext, excerpt: Tool.Parameters<typeof ShowCode>) {
  return Effect.gen(function* () {
    const hunk = context.hunksById.get(excerpt.hunkId)
    if (hunk === undefined) {
      return yield* new ToolRejected({
        message: `${excerpt.hunkId} is not one of this chapter's hunks.`,
      })
    }
    const problem = excerptProblem(hunk, excerpt.lines)
    if (problem !== null) return yield* new ToolRejected({ message: problem })

    const chapter = yield* loadChapter(context)
    if (chapter.excerpts.length >= maxExcerptsPerChapter) {
      return yield* new ToolRejected({
        message: `This chapter already shows ${maxExcerptsPerChapter} excerpts, the most it may. Keep the ones that matter most.`,
      })
    }
    yield* context.mutations.addExcerpt(context.run.guideId, context.run.chapterKey, excerpt)
    return "Excerpt saved."
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

// 3 excerpts of up to 15 lines: enough to show the heart of a change or the
// line a flag is about, too little to paste a whole hunk back in.
const maxExcerptsPerChapter = 3
const maxExcerptLines = 15

export function excerptProblem(hunk: Hunk, lines: HunkLineRange): string | null {
  const isInsideHunk = lines.start <= lines.end && lines.end <= hunk.lines.length
  if (!isInsideHunk) {
    return `${hunk.id} has ${hunk.lines.length} lines; ${lines.start}-${lines.end} is out of range.`
  }
  const lineCount = lines.end - lines.start + 1
  if (lineCount > maxExcerptLines) {
    return `An excerpt can be at most ${maxExcerptLines} lines; ${lines.start}-${lines.end} is ${lineCount}. Pick the lines that matter.`
  }
  const shownLines = hunk.lines.slice(lines.start - 1, lines.end)
  const showsAChange = shownLines.some((line) => line.kind !== "context")
  if (!showsAChange)
    return `Lines ${lines.start}-${lines.end} of ${hunk.id} don't include a changed line.`
  return null
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

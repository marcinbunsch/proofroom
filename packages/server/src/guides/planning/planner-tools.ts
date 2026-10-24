import {
  PlannerToolkit,
  ToolRejected,
  type AddChapter,
  type GuideId,
  type Hunk,
  type HunkId,
  type Placement,
  type PlaceHunks,
  type ReadHunks,
  type SetOverview,
} from "@proofroom/protocol"
import { Deferred, Effect, Semaphore } from "effect"
import type { Tool } from "effect/ai"
import { GuideMutationService } from "../../storage/guides/GuideMutationService.ts"
import { GuideQueryService } from "../../storage/guides/GuideQueryService.ts"
import { checkCoverage, describeCoverageProblem } from "../coverage.ts"
import { checkDiagram } from "../diagrams.ts"
import { hunkText } from "../hunk-text.ts"

// The planner's tools for one guide. Every call is checked against the pull
// request's real hunks and the guide as stored before anything is saved.
//
// Nothing about the run is kept in memory: the guide in the database is the
// only record of what the planner has done so far, so a check like "does this
// chapter exist?" asks the database.

export interface PlannerRun {
  readonly guideId: GuideId
  readonly hunks: ReadonlyArray<Hunk>
  // Completed by finish_plan once every changed line is placed. The planner
  // run reads it after the agent exits: an agent that stops without a passing
  // plan has failed, whatever its last message says.
  readonly planAccepted: Deferred.Deferred<void>
}

// Calls are handled one at a time, in the order they arrive. An agent can make
// several at once, and each check reads the guide as the last call left it:
// a place_hunks running alongside finish_plan could otherwise land after the
// coverage check passed.
export function plannerToolHandlers(run: PlannerRun) {
  return PlannerToolkit.toLayer(
    Effect.gen(function* () {
      const context: PlannerContext = {
        run,
        hunksById: new Map(run.hunks.map((hunk) => [hunk.id, hunk])),
        queries: yield* GuideQueryService,
        mutations: yield* GuideMutationService,
      }
      const oneAtATime = (yield* Semaphore.make(1)).withPermit
      return {
        read_hunks: (parameters) => oneAtATime(readHunks(context, parameters)),
        set_overview: (parameters) => oneAtATime(setOverview(context, parameters)),
        add_chapter: (parameters) => oneAtATime(addChapter(context, parameters)),
        place_hunks: (parameters) => oneAtATime(placeHunks(context, parameters)),
        finish_plan: () => oneAtATime(finishPlan(context)),
      }
    }),
  )
}

interface PlannerContext {
  readonly run: PlannerRun
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
  readonly queries: GuideQueryService["Service"]
  readonly mutations: GuideMutationService["Service"]
}

// --- the tools ---------------------------------------------------------------------

function readHunks(context: PlannerContext, { hunkIds }: Tool.Parameters<typeof ReadHunks>) {
  return findHunks(context, hunkIds).pipe(
    Effect.map((hunks) => hunks.map((hunk) => hunkText(hunk)).join("\n\n")),
  )
}

function setOverview(
  context: PlannerContext,
  { summary, diagram }: Tool.Parameters<typeof SetOverview>,
) {
  return Effect.gen(function* () {
    yield* refuseChangesOnceAccepted(context)
    yield* checkDiagram(diagram)
    yield* context.mutations.setOverview(context.run.guideId, { summary, diagram })
    return "Overview saved."
  })
}

function addChapter(
  context: PlannerContext,
  { key, title, purpose }: Tool.Parameters<typeof AddChapter>,
) {
  return Effect.gen(function* () {
    yield* refuseChangesOnceAccepted(context)
    const guide = yield* loadGuide(context)
    const keyTaken = guide.chapters.some((chapter) => chapter.key === key)
    if (keyTaken)
      return yield* new ToolRejected({ message: `A chapter with key "${key}" already exists.` })

    yield* context.mutations.addChapter(context.run.guideId, { key, title, purpose })
    return `Chapter "${key}" added as chapter ${guide.chapters.length + 1}.`
  })
}

// All or nothing: if any placement in the call is wrong, none are saved, so
// the planner never has to work out which half of a batch went through.
function placeHunks(context: PlannerContext, { placements }: Tool.Parameters<typeof PlaceHunks>) {
  return Effect.gen(function* () {
    yield* refuseChangesOnceAccepted(context)
    const guide = yield* loadGuide(context)
    const chapterKeys = new Set(guide.chapters.map((chapter) => chapter.key))
    const problems = placements.flatMap((placement) =>
      placementProblems(context, chapterKeys, placement),
    )
    if (problems.length > 0) {
      return yield* new ToolRejected({ message: ["Nothing was saved.", ...problems].join("\n") })
    }
    yield* context.mutations.replacePlacements(context.run.guideId, placements)
    return `${placements.length} placements saved.`
  })
}

function finishPlan(context: PlannerContext) {
  return Effect.gen(function* () {
    if (yield* Deferred.isDone(context.run.planAccepted)) return planAcceptedReply
    const guide = yield* loadGuide(context)
    if (guide.summary === null)
      return yield* new ToolRejected({ message: "Call set_overview first." })

    const problems = checkCoverage(context.run.hunks, guide.placements).map(describeCoverageProblem)
    if (problems.length > 0) return yield* new ToolRejected({ message: planIncomplete(problems) })

    yield* Deferred.succeed(context.run.planAccepted, undefined)
    return planAcceptedReply
  })
}

const planAcceptedReply = "Plan accepted: every changed line is placed. You are done; stop now."

// --- checks --------------------------------------------------------------------------

// The accepted plan is the one the chapters get written from, so it can't
// change after finish_plan passed.
function refuseChangesOnceAccepted(context: PlannerContext) {
  return Effect.gen(function* () {
    if (yield* Deferred.isDone(context.run.planAccepted)) {
      return yield* new ToolRejected({
        message: "The plan is accepted and can't change now. You are done; stop now.",
      })
    }
  })
}

function findHunks(
  context: PlannerContext,
  hunkIds: ReadonlyArray<HunkId>,
): Effect.Effect<Array<Hunk>, ToolRejected> {
  const found: Array<Hunk> = []
  const unknownIds: Array<HunkId> = []
  for (const hunkId of hunkIds) {
    const hunk = context.hunksById.get(hunkId)
    if (hunk === undefined) unknownIds.push(hunkId)
    else found.push(hunk)
  }
  if (unknownIds.length > 0) {
    return Effect.fail(
      new ToolRejected({ message: `Not hunks of this pull request: ${unknownIds.join(", ")}.` }),
    )
  }
  return Effect.succeed(found)
}

function placementProblems(
  context: PlannerContext,
  chapterKeys: ReadonlySet<string>,
  placement: Placement,
): Array<string> {
  const hunk = context.hunksById.get(placement.hunkId)
  if (hunk === undefined) return [`${placement.hunkId} is not a hunk of this pull request.`]

  const problems: Array<string> = []
  const { target, lines } = placement
  if (target._tag === "chapter" && !chapterKeys.has(target.chapterKey)) {
    problems.push(
      `${placement.hunkId}: there is no chapter "${target.chapterKey}"; add it with add_chapter first.`,
    )
  }
  const isRangeInside =
    lines === null || (lines.start <= lines.end && lines.end <= hunk.lines.length)
  if (!isRangeInside) {
    problems.push(
      `${placement.hunkId} has ${hunk.lines.length} lines; ${lines?.start}-${lines?.end} is out of range.`,
    )
  }
  return problems
}

// The guide is always there while its planner runs; a missing one is a bug.
function loadGuide(context: PlannerContext) {
  return context.queries.loadGuide(context.run.guideId).pipe(Effect.orDie)
}

// 40 problems is plenty to act on. A planner that skipped half of a huge pull
// request would otherwise get a reply thousands of lines long.
const maxProblemsShown = 40

function planIncomplete(problems: ReadonlyArray<string>): string {
  const shown = problems.slice(0, maxProblemsShown)
  const hiddenCount = problems.length - shown.length
  return [
    "The plan is not complete yet. Fix these with place_hunks, then call finish_plan again:",
    ...shown,
    ...(hiddenCount > 0 ? [`…and ${hiddenCount} more.`] : []),
  ].join("\n")
}

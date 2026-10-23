import { NodeRuntime } from "@effect/platform-node"
import { AgentCli, type Guide, type Hunk } from "@proofroom/protocol"
import { Console, Effect, Schema, Stream } from "effect"
import { checkCoverage, describeCoverageProblem } from "../src/guides/coverage.ts"
import { GuideGenerationService } from "../src/guides/GuideGenerationService.ts"
import { ServerLive } from "../src/ServerLayer.ts"
import { GuideQueryService } from "../src/storage/guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "../src/storage/guides/GuideSubscriptionService.ts"

// Writes a guide for a pull request and prints it as text, without the UI:
// for trying the pipeline on a real pull request, and for tuning the prompts.
//
//   pnpm --filter @proofroom/server generate-guide <pull request URL> [claude|codex]
//
// The guide is saved like any other, in ~/.proofroom unless PROOFROOM_HOME
// points elsewhere.

const program = Effect.gen(function* () {
  const { pullRequestUrl, cli } = yield* readArguments(process.argv.slice(2))
  const generation = yield* GuideGenerationService
  const subscriptions = yield* GuideSubscriptionService
  const queries = yield* GuideQueryService

  const guideId = yield* generation.start(pullRequestUrl, cli)
  yield* Console.log(`Writing guide ${guideId} with ${cli}…`)

  const finishedGuide = yield* subscriptions.watchGuide(guideId).pipe(
    Stream.changesWith((before, after) => progressLine(before) === progressLine(after)),
    Stream.tap((guide) => Console.log(progressLine(guide))),
    Stream.takeUntil((guide) => guide.status === "done" || guide.status === "failed"),
    Stream.runLast,
  )
  const hunks = yield* queries.loadHunks(guideId)
  if (finishedGuide._tag === "Some") yield* Console.log(guideAsText(finishedGuide.value, hunks))
})

function readArguments(args: ReadonlyArray<string>) {
  const [pullRequestUrl, cli = "claude"] = args
  if (pullRequestUrl === undefined) {
    return Effect.die("usage: generate-guide <pull request URL> [claude|codex]")
  }
  return Schema.decodeUnknownEffect(AgentCli)(cli).pipe(
    Effect.map((agentCli) => ({ pullRequestUrl, cli: agentCli })),
    Effect.catch(() => Effect.die(`unknown CLI "${cli}"; use claude or codex`)),
  )
}

// "writing: discounts done, coupons writing"
function progressLine(guide: Guide): string {
  const chapters = guide.chapters.map((chapter) => `${chapter.key} ${chapter.status}`).join(", ")
  return chapters === "" ? guide.status : `${guide.status}: ${chapters}`
}

// --- printing the guide ------------------------------------------------------------

function guideAsText(guide: Guide, hunks: ReadonlyArray<Hunk>): string {
  const pullRequest = `${guide.pullRequest.owner}/${guide.pullRequest.repo}#${guide.pullRequest.number}`
  return [
    `# ${guide.title} (${pullRequest})`,
    ...(guide.status === "failed" ? [`FAILED: ${guide.failure}`] : []),
    guide.summary ?? "(no overview)",
    diagramText(guide.overviewDiagram),
    ...guide.chapters.map((chapter) =>
      [
        `## ${chapter.position + 1}. ${chapter.title} [${chapter.status}]`,
        `Purpose: ${chapter.purpose}`,
        chapter.failure === null ? "" : `FAILED: ${chapter.failure}`,
        chapter.body ?? "",
        diagramText(chapter.diagram),
        ...chapter.flags.map(
          (flag) => `⚑ ${flag.kind} at ${flag.hunkId} line ${flag.line}: ${flag.note}`,
        ),
        `Hunks: ${hunksIn(guide, chapter.key).join(", ")}`,
      ].join("\n"),
    ),
    appendixText(guide),
    coverageText(guide, hunks),
  ].join("\n\n")
}

function diagramText(diagram: Guide["overviewDiagram"]): string {
  return diagram === null ? "" : `\`\`\`mermaid\n${diagram.source}\n\`\`\`\n${diagram.caption}`
}

function hunksIn(guide: Guide, chapterKey: string): Array<string> {
  return guide.placements
    .filter(
      (placement) =>
        placement.target._tag === "chapter" && placement.target.chapterKey === chapterKey,
    )
    .map(
      (placement) =>
        placement.hunkId +
        (placement.lines === null
          ? ""
          : ` (lines ${placement.lines.start}-${placement.lines.end})`),
    )
}

function appendixText(guide: Guide): string {
  const appendixPlacements = guide.placements.flatMap((placement) =>
    placement.target._tag === "appendix"
      ? [{ kind: placement.target.kind, hunkId: placement.hunkId }]
      : [],
  )
  const kinds = [...new Set(appendixPlacements.map((placement) => placement.kind))]
  const groups = kinds.map((kind) => {
    const hunkIds = appendixPlacements
      .filter((placement) => placement.kind === kind)
      .map((placement) => placement.hunkId)
    return `- ${kind}: ${hunkIds.join(", ")}`
  })
  return ["## Routine changes", ...(groups.length > 0 ? groups : ["(none)"])].join("\n")
}

function coverageText(guide: Guide, hunks: ReadonlyArray<Hunk>): string {
  const problems = checkCoverage(hunks, guide.placements).map(describeCoverageProblem)
  return [
    "## Unexplained changes",
    ...(problems.length > 0 ? problems : ["(none: every changed line is placed)"]),
  ].join("\n")
}

program.pipe(Effect.provide(ServerLive), NodeRuntime.runMain)

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import { ChapterKey, type GuideId } from "@proofroom/protocol"
import { Deferred, Effect, Option, Ref, Stream } from "effect"
import { AgentRunFailed } from "../src/agents/agent-run.ts"
import { checkCoverage } from "../src/guides/coverage.ts"
import { GuideGenerationService } from "../src/guides/GuideGenerationService.ts"
import { GuideQueryService } from "../src/storage/guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "../src/storage/guides/GuideSubscriptionService.ts"
import { expectAccepted, type ToolReply } from "./fixtures/AgentClient.ts"
import { pullRequestUrl } from "./fixtures/checkout-origin.ts"
import {
  chapterTitleIn,
  hunkIdsByPath,
  type AgentScript,
  type AgentScripts,
} from "./fixtures/FakeAgentRunner.ts"
import {
  chapterWriter,
  completePlanner,
  couponsChapter,
  discountsChapter,
  overview,
  placeIn,
  roundingExcerpt,
} from "./fixtures/scripted-agents.ts"
import { makeTestServerLayer } from "./fixtures/test-server.ts"
import { realProcessesTimeout } from "./fixtures/timeouts.ts"

describe("GuideGenerationService", realProcessesTimeout, () => {
  let workspace = ""
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "proofroom-guides-"))
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // Starts a guide for pull request 482 and waits until it is done or failed.
  function generateGuide(scripts: AgentScripts) {
    return Effect.gen(function* () {
      const generation = yield* GuideGenerationService
      const queries = yield* GuideQueryService
      const guideId = yield* generation.start(pullRequestUrl, "claude")
      const guide = yield* waitUntilSettled(guideId)
      const hunks = yield* queries.loadHunks(guideId)
      return { guide, hunks }
    }).pipe(Effect.provide(makeTestServerLayer(workspace, scripts)))
  }

  function waitUntilSettled(guideId: GuideId) {
    return Effect.gen(function* () {
      const subscriptions = yield* GuideSubscriptionService
      const settled = yield* subscriptions.watchGuide(guideId).pipe(
        Stream.filter((guide) => guide.status === "done" || guide.status === "failed"),
        Stream.runHead,
      )
      return Option.getOrThrow(settled)
    })
  }

  it.effect(
    "agents do their part -> a finished guide: overview, chapters in order, every changed line placed",
    () =>
      Effect.gen(function* () {
        const { guide, hunks } = yield* generateGuide({
          planner: completePlanner,
          chapter: chapterWriter,
        })

        assert.strictEqual(guide.status, "done")
        assert.strictEqual(guide.summary, overview.summary)
        assert.deepStrictEqual(
          guide.chapters.map((chapter) => [chapter.key, chapter.status, chapter.body]),
          [
            ["discounts", "done", "How discounts on cart totals work."],
            ["coupons", "done", "How a first coupon work."],
          ],
        )
        assert.deepStrictEqual(
          guide.chapters[0]?.flags.map((flag) => flag.kind),
          ["hidden-behaviour-change"],
        )
        assert.deepStrictEqual(
          guide.chapters[0]?.excerpts.map(({ lines, why }) => ({ lines, why })),
          [roundingExcerpt],
        )
        assert.deepStrictEqual(checkCoverage(hunks, guide.placements), [])
      }),
  )

  it.effect(
    "planner leaves a hunk out -> finish_plan names it and refuses, until it is placed",
    () =>
      Effect.gen(function* () {
        const finishPlanReplies = yield* Ref.make<Array<ToolReply>>([])
        const forgetfulPlanner: AgentScript = (agent, run) =>
          Effect.gen(function* () {
            const hunkIds = hunkIdsByPath(run.prompt)
            yield* expectAccepted(agent.callTool("set_overview", overview))
            yield* expectAccepted(agent.callTool("add_chapter", discountsChapter))
            yield* expectAccepted(
              agent.callTool("place_hunks", {
                placements: [placeIn(hunkIds.get("src/cart/total.ts"), "discounts")],
              }),
            )
            const firstTry = yield* agent.callTool("finish_plan", {})
            yield* expectAccepted(
              agent.callTool("place_hunks", {
                placements: [placeIn(hunkIds.get("src/cart/coupons.ts"), "discounts")],
              }),
            )
            const secondTry = yield* agent.callTool("finish_plan", {})
            yield* Ref.set(finishPlanReplies, [firstTry, secondTry])
            return "Plan accepted."
          })

        const { guide } = yield* generateGuide({
          planner: forgetfulPlanner,
          chapter: chapterWriter,
        })
        const [firstTry, secondTry] = yield* Ref.get(finishPlanReplies)

        assert.isTrue(firstTry?.isError)
        assert.include(firstTry?.text, "src/cart/coupons.ts")
        assert.include(firstTry?.text, "not placed anywhere")
        assert.isFalse(secondTry?.isError)
        assert.strictEqual(guide.status, "done")
      }),
  )

  it.effect("planner stops without finishing its plan -> the guide fails, saying why", () =>
    Effect.gen(function* () {
      const quittingPlanner: AgentScript = (agent) =>
        agent.callTool("set_overview", overview).pipe(Effect.as("I think that covers it."))

      const { guide } = yield* generateGuide({ planner: quittingPlanner, chapter: chapterWriter })

      assert.strictEqual(guide.status, "failed")
      assert.include(guide.failure, "stopped before its plan was complete")
      assert.include(guide.failure, "I think that covers it.")
    }),
  )

  it.effect(
    "one chapter run fails -> only that chapter fails, the rest of the guide is finished",
    () =>
      Effect.gen(function* () {
        const couponsCrash: AgentScript = (agent, run) =>
          chapterTitleIn(run.prompt) === couponsChapter.title
            ? Effect.fail(new AgentRunFailed({ message: "claude exited with 1: rate limited" }))
            : chapterWriter(agent, run)

        const { guide } = yield* generateGuide({ planner: completePlanner, chapter: couponsCrash })

        assert.strictEqual(guide.status, "done")
        assert.deepStrictEqual(
          guide.chapters.map((chapter) => [chapter.key, chapter.status, chapter.failure]),
          [
            ["discounts", "done", null],
            ["coupons", "failed", "claude exited with 1: rate limited"],
          ],
        )
      }),
  )

  it.effect(
    "broken Mermaid or a flag outside the chapter -> refused with the reason, nothing saved",
    () =>
      Effect.gen(function* () {
        const refusals = yield* Ref.make<Array<ToolReply>>([])
        const sloppyPlanner: AgentScript = (agent, run) =>
          Effect.gen(function* () {
            const brokenDiagram = {
              source: "flowchart LR\n  Checkout --> CartTotal[cartTotal(prices)]",
              caption: "",
            }
            const refused = yield* agent.callTool("set_overview", {
              summary: overview.summary,
              diagram: brokenDiagram,
            })
            yield* Ref.update(refusals, (replies) => [...replies, refused])
            return yield* completePlanner(agent, run)
          })
        const sloppyWriter: AgentScript = (agent, run) =>
          Effect.gen(function* () {
            const refused = yield* agent.callTool("add_flag", {
              hunkId: "h0000000000",
              line: 1,
              kind: "risky-logic",
              note: "Not this chapter's code.",
            })
            yield* Ref.update(refusals, (replies) => [...replies, refused])
            return yield* chapterWriter(agent, run)
          })

        const { guide } = yield* generateGuide({ planner: sloppyPlanner, chapter: sloppyWriter })
        const [diagramRefusal, flagRefusal] = yield* Ref.get(refusals)

        assert.isTrue(diagramRefusal?.isError)
        assert.include(diagramRefusal?.text, "doesn't parse")
        assert.isTrue(flagRefusal?.isError)
        assert.include(flagRefusal?.text, "not one of this chapter's hunks")
        assert.deepStrictEqual(guide.overviewDiagram, overview.diagram)
        assert.strictEqual(guide.chapters[0]?.flags.length, 1)
      }),
  )

  it.effect(
    "excerpts from another chapter's hunk, or a fourth one -> refused, the first three kept",
    () =>
      Effect.gen(function* () {
        const replies = yield* Ref.make<Array<ToolReply>>([])
        const greedyWriter: AgentScript = (agent, run) =>
          Effect.gen(function* () {
            if (chapterTitleIn(run.prompt) !== discountsChapter.title)
              return yield* chapterWriter(agent, run)
            const totalHunkId = hunkIdsByPath(run.prompt).get("src/cart/total.ts")
            const showLines = (start: number, end: number) =>
              agent.callTool("show_code", {
                hunkId: totalHunkId,
                lines: { start, end },
                why: "Worth a look.",
              })
            const fromOtherChapter = yield* agent.callTool("show_code", {
              hunkId: "h0000000000",
              lines: { start: 1, end: 1 },
              why: "Not this chapter's code.",
            })
            yield* expectAccepted(showLines(1, 2))
            yield* expectAccepted(showLines(3, 4))
            yield* expectAccepted(showLines(5, 5))
            const fourth = yield* showLines(1, 5)
            yield* Ref.set(replies, [fromOtherChapter, fourth])
            yield* expectAccepted(
              agent.callTool("write_chapter", { body: "Discounts.", diagram: null }),
            )
            yield* expectAccepted(agent.callTool("finish_chapter", {}))
            return "Chapter finished."
          })

        const { guide } = yield* generateGuide({ planner: completePlanner, chapter: greedyWriter })
        const [fromOtherChapter, fourth] = yield* Ref.get(replies)

        assert.include(fromOtherChapter?.text, "not one of this chapter's hunks")
        assert.include(fourth?.text, "already shows 3 excerpts")
        assert.deepStrictEqual(
          guide.chapters[0]?.excerpts.map((excerpt) => excerpt.lines),
          [
            { start: 1, end: 2 },
            { start: 3, end: 4 },
            { start: 5, end: 5 },
          ],
        )
      }),
  )

  it.effect(
    "planner changes its plan after it was accepted -> refused, the accepted plan kept",
    () =>
      Effect.gen(function* () {
        const lateChange = yield* Ref.make<ToolReply | null>(null)
        const secondThoughtsPlanner: AgentScript = (agent, run) =>
          Effect.gen(function* () {
            yield* completePlanner(agent, run)
            const totalHunkId = hunkIdsByPath(run.prompt).get("src/cart/total.ts")
            const reply = yield* agent.callTool("place_hunks", {
              placements: [placeIn(totalHunkId, "coupons")],
            })
            yield* Ref.set(lateChange, reply)
            return "Moved the totals into coupons."
          })

        const { guide, hunks } = yield* generateGuide({
          planner: secondThoughtsPlanner,
          chapter: chapterWriter,
        })
        const reply = yield* Ref.get(lateChange)
        const totalHunk = hunks.find((hunk) => hunk.path === "src/cart/total.ts")
        const totalPlacement = guide.placements.find(
          (placement) => placement.hunkId === totalHunk?.id,
        )

        assert.isTrue(reply?.isError)
        assert.include(reply?.text, "accepted and can't change")
        assert.strictEqual(guide.status, "done")
        assert.deepStrictEqual(totalPlacement?.target, {
          _tag: "chapter",
          chapterKey: ChapterKey.make("discounts"),
        })
      }),
  )

  it.effect("agents crash after finishing their work -> the guide is still written", () =>
    Effect.gen(function* () {
      const crashAfter =
        (script: AgentScript): AgentScript =>
        (agent, run) =>
          script(agent, run).pipe(
            Effect.andThen(
              Effect.fail(new AgentRunFailed({ message: "claude exited with 1: socket hang up" })),
            ),
          )

      const { guide } = yield* generateGuide({
        planner: crashAfter(completePlanner),
        chapter: crashAfter(chapterWriter),
      })

      assert.strictEqual(guide.status, "done")
      assert.deepStrictEqual(
        guide.chapters.map((chapter) => chapter.status),
        ["done", "done"],
      )
    }),
  )

  it.effect("a hunk split between chapters -> flags and excerpts only on the chapter's part", () =>
    Effect.gen(function* () {
      const replies = yield* Ref.make<Array<ToolReply>>([])
      // total.ts's hunk: lines 1-2 delete the old body, 3-5 add the new one,
      // 6 is the closing brace. The rounded return (5) goes to coupons.
      const splittingPlanner: AgentScript = (agent, run) =>
        Effect.gen(function* () {
          const hunkIds = hunkIdsByPath(run.prompt)
          const totalHunkId = hunkIds.get("src/cart/total.ts")
          yield* expectAccepted(agent.callTool("set_overview", overview))
          yield* expectAccepted(agent.callTool("add_chapter", discountsChapter))
          yield* expectAccepted(agent.callTool("add_chapter", couponsChapter))
          const part = (start: number, end: number, chapterKey: string) => ({
            ...placeIn(totalHunkId, chapterKey),
            lines: { start, end },
          })
          yield* expectAccepted(
            agent.callTool("place_hunks", {
              placements: [
                part(1, 4, "discounts"),
                part(5, 6, "coupons"),
                placeIn(hunkIds.get("src/cart/coupons.ts"), "coupons"),
              ],
            }),
          )
          yield* expectAccepted(agent.callTool("finish_plan", {}))
          return "Plan accepted."
        })
      const discountsWriter: AgentScript = (agent, run) =>
        Effect.gen(function* () {
          if (chapterTitleIn(run.prompt) !== discountsChapter.title)
            return yield* chapterWriter(agent, run)
          const totalHunkId = hunkIdsByPath(run.prompt).get("src/cart/total.ts")
          yield* expectAccepted(
            agent.callTool("write_chapter", { body: "Discounts.", diagram: null }),
          )
          const flagOnCoupons = yield* agent.callTool("add_flag", {
            hunkId: totalHunkId,
            line: 5,
            kind: "hidden-behaviour-change",
            note: "Rounded now.",
          })
          const excerptOfCoupons = yield* agent.callTool("show_code", {
            hunkId: totalHunkId,
            lines: { start: 5, end: 6 },
            why: "The rounding.",
          })
          yield* Ref.set(replies, [flagOnCoupons, excerptOfCoupons])
          yield* expectAccepted(
            agent.callTool("show_code", {
              hunkId: totalHunkId,
              lines: { start: 3, end: 5 },
              why: "The new signature, and the return it feeds.",
            }),
          )
          yield* expectAccepted(agent.callTool("finish_chapter", {}))
          return "Chapter finished."
        })

      const { guide } = yield* generateGuide({
        planner: splittingPlanner,
        chapter: discountsWriter,
      })
      const [flagOnCoupons, excerptOfCoupons] = yield* Ref.get(replies)

      assert.include(flagOnCoupons?.text, "belongs to another chapter. This chapter has lines 1-4")
      assert.include(excerptOfCoupons?.text, "show none of this chapter's changes")
      assert.deepStrictEqual(guide.chapters[0]?.flags, [])
      assert.deepStrictEqual(
        guide.chapters[0]?.excerpts.map((excerpt) => excerpt.lines),
        [{ start: 3, end: 5 }],
      )
    }),
  )

  it.effect("chapter run stops without finish_chapter -> that chapter fails, saying why", () =>
    Effect.gen(function* () {
      const quittingWriter: AgentScript = (agent, run) =>
        chapterTitleIn(run.prompt) === couponsChapter.title
          ? agent
              .callTool("write_chapter", { body: "Coupons.", diagram: null })
              .pipe(Effect.as("Written, I think."))
          : chapterWriter(agent, run)

      const { guide } = yield* generateGuide({ planner: completePlanner, chapter: quittingWriter })
      const coupons = guide.chapters.find((chapter) => chapter.key === "coupons")

      assert.strictEqual(guide.status, "done")
      assert.strictEqual(coupons?.status, "failed")
      assert.include(coupons?.failure, "stopped before finishing")
      assert.include(coupons?.failure, "Written, I think.")
    }),
  )

  it.effect("app shuts down while a guide is being written -> its agent is stopped", () =>
    Effect.gen(function* () {
      const plannerStarted = yield* Deferred.make<void>()
      const plannerStopped = yield* Deferred.make<void>()
      const endlessPlanner: AgentScript = () =>
        Deferred.succeed(plannerStarted, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(plannerStopped, undefined)),
        )

      // The layer, and so the app, shuts down when this inner effect ends.
      yield* Effect.gen(function* () {
        const generation = yield* GuideGenerationService
        yield* generation.start(pullRequestUrl, "claude")
        yield* Deferred.await(plannerStarted)
      }).pipe(
        Effect.provide(
          makeTestServerLayer(workspace, { planner: endlessPlanner, chapter: chapterWriter }),
        ),
      )

      assert.isTrue(yield* Deferred.isDone(plannerStopped))
    }),
  )
})

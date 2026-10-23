import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import type { GuideId } from "@proofroom/protocol"
import { Effect, Layer, Option, Ref, Stream } from "effect"
import { AppPaths } from "../src/AppPaths.ts"
import { AgentRunFailed } from "../src/agents/agent-run.ts"
import { checkCoverage } from "../src/guides/coverage.ts"
import { GuideGenerationService } from "../src/guides/GuideGenerationService.ts"
import { GitRemoteUrl } from "../src/pull-requests/GitRemoteUrl.ts"
import { GuideQueryService } from "../src/storage/guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "../src/storage/guides/GuideSubscriptionService.ts"
import { makeStorageLayer } from "../src/storage/StorageLayer.ts"
import { expectAccepted, type ToolReply } from "./fixtures/AgentClient.ts"
import { createCheckoutOrigin, fakeGitHub, pullRequestUrl } from "./fixtures/checkout-origin.ts"
import {
  chapterTitleIn,
  fakeAgentRunner,
  hunkIdsByPath,
  type AgentScript,
  type AgentScripts,
} from "./fixtures/FakeAgentRunner.ts"
import { realProcessesTimeout } from "./fixtures/timeouts.ts"

// --- scripted agents ---------------------------------------------------------------

const discountsChapter = {
  key: "discounts",
  title: "Discounts on cart totals",
  purpose: "cartTotal takes a percentage and rounds after applying it",
}
const couponsChapter = {
  key: "coupons",
  title: "A first coupon",
  purpose: "WELCOME10 is the first coupon code",
}

const overview = {
  summary: "Cart totals can now take a percentage discount. A first coupon code uses it.",
  diagram: {
    source: 'flowchart LR\n  Checkout --> CartTotal["cartTotal(prices, discountPercent)"]',
    caption: "Where totals are computed",
  },
}

function placeIn(hunkId: string | undefined, chapterKey: string) {
  return { hunkId, lines: null, target: { _tag: "chapter", chapterKey } }
}

// A planner that does everything right: overview, two chapters, every hunk
// placed, plan finished.
const completePlanner: AgentScript = (agent, run) =>
  Effect.gen(function* () {
    const hunkIds = hunkIdsByPath(run.prompt)
    yield* expectAccepted(agent.callTool("set_overview", overview))
    yield* expectAccepted(agent.callTool("add_chapter", discountsChapter))
    yield* expectAccepted(agent.callTool("add_chapter", couponsChapter))
    yield* expectAccepted(
      agent.callTool("place_hunks", {
        placements: [
          placeIn(hunkIds.get("src/cart/total.ts"), "discounts"),
          placeIn(hunkIds.get("src/cart/coupons.ts"), "coupons"),
        ],
      }),
    )
    yield* expectAccepted(agent.callTool("finish_plan", {}))
    return "Plan accepted."
  })

// A chapter writer that writes its chapter, flags the rounding change in the
// discounts chapter, and finishes.
const chapterWriter: AgentScript = (agent, run) =>
  Effect.gen(function* () {
    const title = chapterTitleIn(run.prompt)
    yield* expectAccepted(
      agent.callTool("write_chapter", { body: `How ${title.toLowerCase()} work.`, diagram: null }),
    )
    if (title === discountsChapter.title) {
      const totalHunkId = hunkIdsByPath(run.prompt).get("src/cart/total.ts")
      yield* expectAccepted(
        agent.callTool("add_flag", {
          hunkId: totalHunkId,
          line: 5,
          kind: "hidden-behaviour-change",
          note: "Totals are now rounded; callers that passed fractions get whole numbers back.",
        }),
      )
    }
    yield* expectAccepted(agent.callTool("finish_chapter", {}))
    return "Chapter finished."
  })

// --- running a guide ---------------------------------------------------------------

describe("GuideGenerationService", realProcessesTimeout, () => {
  let workspace = ""
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "proofroom-guides-"))
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // Real git, real storage, real tool servers; only GitHub and the agent are
  // stand-ins.
  function guideGenerationLayer(scripts: AgentScripts) {
    const { origin } = createCheckoutOrigin(join(workspace, "origin"))
    return GuideGenerationService.layer.pipe(
      Layer.provideMerge(makeStorageLayer(":memory:")),
      Layer.provide(fakeAgentRunner(scripts)),
      Layer.provide(fakeGitHub),
      Layer.provide(Layer.succeed(GitRemoteUrl, () => origin.path)),
      Layer.provide(AppPaths.fromHome(join(workspace, "home"))),
      Layer.provide(NodeServices.layer),
    )
  }

  // Starts a guide for pull request 482 and waits until it is done or failed.
  function generateGuide(scripts: AgentScripts) {
    return Effect.gen(function* () {
      const generation = yield* GuideGenerationService
      const queries = yield* GuideQueryService
      const guideId = yield* generation.start(pullRequestUrl, "claude")
      const guide = yield* waitUntilSettled(guideId)
      const hunks = yield* queries.loadHunks(guideId)
      return { guide, hunks }
    }).pipe(Effect.provide(guideGenerationLayer(scripts)))
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
})

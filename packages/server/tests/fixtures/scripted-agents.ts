import { Effect } from "effect"
import { expectAccepted } from "./AgentClient.ts"
import { chapterTitleIn, hunkIdsByPath, type AgentScript } from "./FakeAgentRunner.ts"

// Scripted agents for pull request 482 (see checkout-origin.ts): a planner and
// a chapter writer that do everything right. Tests build sloppier ones from
// these.

export const discountsChapter = {
  key: "discounts",
  title: "Discounts on cart totals",
  purpose: "cartTotal takes a percentage and rounds after applying it",
}
export const couponsChapter = {
  key: "coupons",
  title: "A first coupon",
  purpose: "WELCOME10 is the first coupon code",
}

// Lines 3-5 of total.ts's hunk: the new signature and the rounded return.
export const roundingExcerpt = {
  lines: { start: 3, end: 5 },
  why: "The total is now rounded after the discount, so results change by up to half a cent.",
}

// What the discounts chapter shows of the rounding: one case, before and after.
export const roundingVisual = {
  _tag: "behaviourChange",
  title: "Totals with a discount",
  cases: [{ situation: "$10.01 at 50% off", before: "500.5 cents", after: "501 cents" }],
} as const

export const overview = {
  summary: "Cart totals can now take a percentage discount. A first coupon code uses it.",
  diagram: {
    source: 'flowchart LR\n  Checkout --> CartTotal["cartTotal(prices, discountPercent)"]',
    caption: "Where totals are computed",
  },
}

export function placeIn(hunkId: string | undefined, chapterKey: string) {
  return { hunkId, lines: null, target: { _tag: "chapter", chapterKey } }
}

// A planner that does everything right: overview, two chapters, every hunk
// placed, plan finished.
export const completePlanner: AgentScript = (agent, run) =>
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

// A chapter writer that writes its chapter and, in the discounts chapter, shows
// the rounding change, flags it, and finishes.
export const chapterWriter: AgentScript = (agent, run) =>
  Effect.gen(function* () {
    const title = chapterTitleIn(run.prompt)
    yield* expectAccepted(
      agent.callTool("write_chapter", { body: `How ${title.toLowerCase()} work.` }),
    )
    if (title === discountsChapter.title) {
      const totalHunkId = hunkIdsByPath(run.prompt).get("src/cart/total.ts")
      yield* expectAccepted(agent.callTool("add_visual", { visual: roundingVisual }))
      yield* expectAccepted(
        agent.callTool("show_code", { hunkId: totalHunkId, ...roundingExcerpt }),
      )
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

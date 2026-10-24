import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { HistoryToolkit } from "@proofroom/protocol"
import { Effect, Stream } from "effect"
import type { Tool } from "effect/ai"
import { afterEach, beforeEach } from "vitest"
import { historyToolHandlers } from "../src/guides/history-tools.ts"
import { OriginRepository } from "./fixtures/OriginRepository.ts"
import { realProcessesTimeout } from "./fixtures/timeouts.ts"

type HistoryTools = (typeof HistoryToolkit)["tools"]

// Calls a history tool the way the tool server does, and returns what the
// agent would get back.
function callTool<Name extends keyof HistoryTools>(
  name: Name,
  parameters: Tool.ParametersEncoded<HistoryTools[Name]>,
) {
  return Effect.gen(function* () {
    const toolkit = yield* HistoryToolkit
    const results = yield* toolkit.handle(name, parameters).pipe(Effect.flatMap(Stream.runCollect))
    return results.map((result) => result.result).join("")
  })
}

describe("history tools", realProcessesTimeout, () => {
  let workspace = ""
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "proofroom-history-"))
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // A checkout with two commits to src/cart/total.ts, the second adding a
  // discount.
  function withCheckout<A, E, R>(
    test: (commits: { readonly discount: string }) => Effect.Effect<A, E, R>,
  ) {
    const checkout = OriginRepository.create(join(workspace, "checkout"))
    checkout.commit("Add cart totals", {
      "src/cart/total.ts": "export const total = (cents: number) => cents\n",
    })
    const discount = checkout.commit("Take a discount off totals", {
      "src/cart/total.ts":
        "export const total = (cents: number) => cents\nexport const discounted = (cents: number) => cents * 0.9\n",
    })
    return test({ discount }).pipe(
      Effect.provide(historyToolHandlers(checkout.path)),
      Effect.provide(NodeServices.layer),
    )
  }

  it.effect("git_log on a file -> its commits, newest first", () =>
    withCheckout(() =>
      Effect.gen(function* () {
        const log = yield* callTool("git_log", { path: "src/cart/total.ts", maxCount: 10 })

        const subjects = log
          .trim()
          .split("\n")
          .map((line) => line.split(": ")[1])
        assert.deepStrictEqual(subjects, ["Take a discount off totals", "Add cart totals"])
      }),
    ),
  )

  it.effect("git_show on a commit -> its message and its patch", () =>
    withCheckout(({ discount }) =>
      Effect.gen(function* () {
        const shown = yield* callTool("git_show", { commit: discount.slice(0, 10), path: null })

        assert.include(shown, "Take a discount off totals")
        assert.include(shown, "+export const discounted")
      }),
    ),
  )

  it.effect("git_blame on a line -> the commit that last changed it", () =>
    withCheckout(({ discount }) =>
      Effect.gen(function* () {
        const blame = yield* callTool("git_blame", {
          path: "src/cart/total.ts",
          firstLine: 2,
          lastLine: 2,
        })

        assert.isTrue(blame.startsWith(discount.slice(0, 7)))
      }),
    ),
  )

  // Regression: agents used to run git through an allowed shell, where
  // `git show --output=<file>` could write anywhere on the laptop.
  it.effect("an option where a commit goes -> refused before git runs", () =>
    withCheckout(() =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          callTool("git_show", { commit: "--output=/tmp/owned", path: null }),
        )

        assert.strictEqual(error._tag, "AiError")
      }),
    ),
  )

  it.effect("a file that isn't there -> git's reason, for the agent to fix the call", () =>
    withCheckout(() =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          callTool("git_blame", { path: "src/missing.ts", firstLine: 1, lastLine: 1 }),
        )

        assert.strictEqual(error._tag, "ToolRejected")
        assert.include(error.message, "src/missing.ts")
      }),
    ),
  )
})

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import { GenerateFailed, GuideId, GuideNotFound, ProofroomRpcs } from "@proofroom/protocol"
import { Effect, Layer, type Scope, Stream } from "effect"
import { type Rpc, type RpcGroup, RpcTest } from "effect/rpc"
import { RpcHandlersLive } from "../src/rpc/rpc-handlers.ts"
import { pullRequestUrl } from "./fixtures/checkout-origin.ts"
import { chapterWriter, completePlanner } from "./fixtures/scripted-agents.ts"
import { makeTestServerLayer } from "./fixtures/test-server.ts"
import { realProcessesTimeout } from "./fixtures/timeouts.ts"

// The procedures the UI calls, through Effect's in-memory RPC client: the same
// client code the UI uses, without HTTP in between.
// The handlers the in-memory client calls into.
type RpcHandlers = Rpc.ToHandler<RpcGroup.Rpcs<typeof ProofroomRpcs>>

describe("RPC handlers", realProcessesTimeout, () => {
  let workspace = ""
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "proofroom-rpc-"))
  })
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  // The RPC handlers on the test server. Provided around the whole test, so
  // storage stays open while the test watches the guide being written.
  function withRpcHandlers<A, E>(test: Effect.Effect<A, E, Scope.Scope | RpcHandlers>) {
    const server = makeTestServerLayer(workspace, {
      planner: completePlanner,
      chapter: chapterWriter,
    })
    return test.pipe(Effect.scoped, Effect.provide(RpcHandlersLive.pipe(Layer.provide(server))))
  }

  const rpcClient = () => RpcTest.makeClient(ProofroomRpcs)

  it.effect("guide generated -> watched from planning to done, then listed with its hunks", () =>
    Effect.gen(function* () {
      const client = yield* rpcClient()

      const guideId = yield* client.generateGuide({ pullRequestUrl, cli: "claude" })
      const statuses = yield* client.watchGuide({ guideId }).pipe(
        Stream.map((guide) => guide.status),
        Stream.takeUntil((status) => status === "done" || status === "failed"),
        Stream.runCollect,
      )
      const hunks = yield* client.getHunks({ guideId })
      const guides = yield* client.listGuides()

      assert.strictEqual(Array.from(statuses).at(0), "planning")
      assert.strictEqual(Array.from(statuses).at(-1), "done")
      assert.deepStrictEqual(
        hunks.map((hunk) => hunk.path),
        ["src/cart/coupons.ts", "src/cart/total.ts"],
      )
      assert.deepStrictEqual(
        guides.map((guide) => [guide.id, guide.status]),
        [[guideId, "done"]],
      )
    }).pipe(withRpcHandlers),
  )

  it.effect("not a pull request URL -> GenerateFailed with a message the UI can show", () =>
    Effect.gen(function* () {
      const client = yield* rpcClient()

      const error = yield* Effect.flip(
        client.generateGuide({ pullRequestUrl: "https://github.com/acme/checkout", cli: "claude" }),
      )

      assert.instanceOf(error, GenerateFailed)
      assert.include(error.message, "is not a GitHub pull request URL")
    }).pipe(withRpcHandlers),
  )

  it.effect("unknown guide -> GuideNotFound for its hunks", () =>
    Effect.gen(function* () {
      const client = yield* rpcClient()
      const missingGuideId = GuideId.make("0b5a8f2e-6c1d-4e7a-9f3b-2d8c4a6e1f90")

      const error = yield* Effect.flip(client.getHunks({ guideId: missingGuideId }))

      assert.deepStrictEqual(error, new GuideNotFound({ guideId: missingGuideId }))
    }).pipe(withRpcHandlers),
  )
})

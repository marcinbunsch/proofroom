import { assert, describe, it } from "@effect/vitest"
import { ChapterKey, GuideId, GuideNotFound, HunkId, type Hunk } from "@proofroom/protocol"
import { Deferred, Effect, Exit, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { GuideQueryService } from "../src/storage/guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "../src/storage/guides/GuideSubscriptionService.ts"
import { GuideMutationService, type NewGuide } from "../src/storage/guides/GuideMutationService.ts"
import { DraftMutationService } from "../src/storage/reviews/DraftMutationService.ts"
import { DraftQueryService } from "../src/storage/reviews/DraftQueryService.ts"
import { makeStorageLayer } from "../src/storage/StorageLayer.ts"

// The app's own storage wiring, on an in-memory database. The layer is built
// per test, so every test starts with an empty database.
const StorageLayer = makeStorageLayer(":memory:")

const discountGuide: NewGuide = {
  pullRequest: { owner: "acme", repo: "checkout", number: 482 },
  title: "Add percentage discounts to cart totals",
  headSha: "9f3c1e2a7b4d5c6e8f0a1b2c3d4e5f6a7b8c9d0e",
  mergeBaseSha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  cli: "claude",
  hunks: [],
  writerPid: process.pid,
}

const signatureHunk: Hunk = {
  id: HunkId.make("h3fa9c01b2e"),
  path: "src/cart/total.ts",
  oldPath: null,
  fileStatus: "modified",
  oldStart: 3,
  oldLineCount: 1,
  newStart: 3,
  newLineCount: 1,
  sectionHeading: "",
  lines: [
    {
      kind: "deletion",
      text: "export function cartTotal(items: LineItem[]): number {",
      oldLineNumber: 3,
      newLineNumber: null,
    },
    {
      kind: "addition",
      text: "export function cartTotal(items: LineItem[], discountPercent = 0): number {",
      oldLineNumber: null,
      newLineNumber: 3,
    },
  ],
}

const couponHunk: Hunk = {
  id: HunkId.make("h77b20c4e19"),
  path: "src/cart/coupons.ts",
  oldPath: null,
  fileStatus: "added",
  oldStart: 0,
  oldLineCount: 0,
  newStart: 1,
  newLineCount: 1,
  sectionHeading: "",
  lines: [
    {
      kind: "addition",
      text: 'export const WELCOME_COUPON = "WELCOME10"',
      oldLineNumber: null,
      newLineNumber: 1,
    },
  ],
}

const discountsChapter = ChapterKey.make("discounts")
const couponsChapter = ChapterKey.make("coupons")

describe("guide storage", () => {
  it.effect("new guide -> loads back as planning, with its pull request and nothing else yet", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService

      const guideId = yield* mutations.createGuide(discountGuide)
      const guide = yield* queries.loadGuide(guideId)

      assert.deepStrictEqual(guide.pullRequest, { owner: "acme", repo: "checkout", number: 482 })
      assert.strictEqual(guide.status, "planning")
      assert.strictEqual(guide.summary, null)
      assert.deepStrictEqual(guide.chapters, [])
      assert.deepStrictEqual(guide.placements, [])
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("overview set -> summary and diagram come back", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService
      const guideId = yield* mutations.createGuide(discountGuide)

      const diagram = {
        source: "flowchart LR\n  Cart --> Checkout",
        caption: "Where totals are computed",
      }
      yield* mutations.setOverview(guideId, {
        summary: "Cart totals now take a discount.",
        diagram,
      })
      const guide = yield* queries.loadGuide(guideId)

      assert.strictEqual(guide.summary, "Cart totals now take a discount.")
      assert.deepStrictEqual(guide.overviewDiagram, diagram)
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("chapters added -> come back in the order they were added", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService
      const guideId = yield* mutations.createGuide(discountGuide)

      yield* mutations.addChapter(guideId, {
        key: discountsChapter,
        title: "Discounts",
        purpose: "cartTotal takes a percentage",
      })
      yield* mutations.addChapter(guideId, {
        key: couponsChapter,
        title: "Coupons",
        purpose: "A first coupon code",
      })
      const guide = yield* queries.loadGuide(guideId)

      assert.deepStrictEqual(
        guide.chapters.map((chapter) => [chapter.position, chapter.key, chapter.status]),
        [
          [0, "discounts", "waiting"],
          [1, "coupons", "waiting"],
        ],
      )
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("hunk placed again -> its earlier placements replaced, other hunks kept", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService
      const guideId = yield* mutations.createGuide(discountGuide)

      yield* mutations.replacePlacements(guideId, [
        {
          hunkId: signatureHunk.id,
          lines: null,
          target: { _tag: "chapter", chapterKey: discountsChapter },
        },
        {
          hunkId: couponHunk.id,
          lines: null,
          target: { _tag: "chapter", chapterKey: couponsChapter },
        },
      ])
      yield* mutations.replacePlacements(guideId, [
        {
          hunkId: signatureHunk.id,
          lines: { start: 1, end: 1 },
          target: { _tag: "appendix", kind: "renames" },
        },
        {
          hunkId: signatureHunk.id,
          lines: { start: 2, end: 2 },
          target: { _tag: "chapter", chapterKey: discountsChapter },
        },
      ])
      const guide = yield* queries.loadGuide(guideId)

      assert.deepStrictEqual(guide.placements, [
        {
          hunkId: couponHunk.id,
          lines: null,
          target: { _tag: "chapter", chapterKey: couponsChapter },
        },
        {
          hunkId: signatureHunk.id,
          lines: { start: 1, end: 1 },
          target: { _tag: "appendix", kind: "renames" },
        },
        {
          hunkId: signatureHunk.id,
          lines: { start: 2, end: 2 },
          target: { _tag: "chapter", chapterKey: discountsChapter },
        },
      ])
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect(
    "chapter written, with visuals, flags and excerpts -> all of it under that chapter only",
    () =>
      Effect.gen(function* () {
        const mutations = yield* GuideMutationService
        const queries = yield* GuideQueryService
        const guideId = yield* mutations.createGuide(discountGuide)
        yield* mutations.addChapter(guideId, {
          key: discountsChapter,
          title: "Discounts",
          purpose: "cartTotal takes a percentage",
        })
        yield* mutations.addChapter(guideId, {
          key: couponsChapter,
          title: "Coupons",
          purpose: "A first coupon code",
        })

        const diagram = {
          _tag: "diagram",
          source: "flowchart LR\n  Items --> Sum --> Discount --> Round",
          caption: "How a total is computed",
        } as const
        const rounding = {
          _tag: "behaviourChange",
          title: "Totals with a discount",
          cases: [{ situation: "$10.01 at 50% off", before: "500.5 cents", after: "501 cents" }],
        } as const
        yield* mutations.writeChapter(guideId, discountsChapter, {
          body: "The total now rounds after discounting.",
        })
        yield* mutations.addVisual(guideId, discountsChapter, diagram)
        yield* mutations.addVisual(guideId, discountsChapter, rounding)
        yield* mutations.addFlag(guideId, discountsChapter, {
          hunkId: signatureHunk.id,
          line: 2,
          kind: "hidden-behaviour-change",
          note: "Rounding moved: totals for existing callers can change by a cent.",
        })
        yield* mutations.addExcerpt(guideId, discountsChapter, {
          hunkId: signatureHunk.id,
          lines: { start: 1, end: 2 },
          why: "The signature gains a discount, with 0 as the default.",
        })
        yield* mutations.setChapterStatus(guideId, discountsChapter, "done", null)
        const [discounts, coupons] = (yield* queries.loadGuide(guideId)).chapters

        assert.strictEqual(discounts?.status, "done")
        assert.strictEqual(discounts?.body, "The total now rounds after discounting.")
        assert.deepStrictEqual(discounts?.visuals, [diagram, rounding])
        assert.deepStrictEqual(
          discounts?.flags.map((flag) => [flag.hunkId, flag.line, flag.kind]),
          [[signatureHunk.id, 2, "hidden-behaviour-change"]],
        )
        assert.deepStrictEqual(discounts?.excerpts, [
          {
            hunkId: signatureHunk.id,
            lines: { start: 1, end: 2 },
            why: "The signature gains a discount, with 0 as the default.",
          },
        ])
        assert.deepStrictEqual(coupons?.flags, [])
        assert.deepStrictEqual(coupons?.visuals, [])
        assert.deepStrictEqual(coupons?.excerpts, [])
      }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("guide created with its hunks -> hunks loaded back in diff order", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService

      const guideId = yield* mutations.createGuide({
        ...discountGuide,
        hunks: [signatureHunk, couponHunk],
      })
      const hunks = yield* queries.loadHunks(guideId)

      assert.deepStrictEqual(hunks, [signatureHunk, couponHunk])
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect(
    "abandoned guides failed -> they and their unfinished chapters fail; finished guides, and ones still being written, untouched",
    () =>
      Effect.gen(function* () {
        const mutations = yield* GuideMutationService
        const queries = yield* GuideQueryService
        const stoppedWriter = 4101
        const runningWriter = 4102
        const finishedId = yield* mutations.createGuide({
          ...discountGuide,
          writerPid: stoppedWriter,
        })
        yield* mutations.setGuideStatus(finishedId, "done", null)
        const stillWrittenId = yield* mutations.createGuide({
          ...discountGuide,
          writerPid: runningWriter,
        })
        const unfinishedId = yield* mutations.createGuide({
          ...discountGuide,
          writerPid: stoppedWriter,
        })
        yield* mutations.addChapter(unfinishedId, {
          key: discountsChapter,
          title: "Discounts",
          purpose: "cartTotal takes a percentage",
        })
        yield* mutations.addChapter(unfinishedId, {
          key: couponsChapter,
          title: "Coupons",
          purpose: "A first coupon code",
        })
        yield* mutations.setChapterStatus(unfinishedId, discountsChapter, "done", null)
        yield* mutations.setGuideStatus(unfinishedId, "writing", null)

        yield* mutations.failAbandonedGuides("Proofroom stopped.", (pid) => pid === runningWriter)
        const finished = yield* queries.loadGuide(finishedId)
        const stillWritten = yield* queries.loadGuide(stillWrittenId)
        const unfinished = yield* queries.loadGuide(unfinishedId)

        assert.strictEqual(finished.status, "done")
        assert.strictEqual(stillWritten.status, "planning")
        assert.deepStrictEqual(
          [unfinished.status, unfinished.failure],
          ["failed", "Proofroom stopped."],
        )
        assert.deepStrictEqual(
          unfinished.chapters.map((chapter) => [chapter.key, chapter.status]),
          [
            ["discounts", "done"],
            ["coupons", "failed"],
          ],
        )
      }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("guide deleted -> it, its hunks and its drafts are gone; other guides stay", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService
      const draftMutations = yield* DraftMutationService
      const drafts = yield* DraftQueryService
      const keptId = yield* mutations.createGuide({ ...discountGuide, hunks: [couponHunk] })
      const deletedId = yield* mutations.createGuide({ ...discountGuide, hunks: [signatureHunk] })
      yield* mutations.addChapter(deletedId, {
        key: discountsChapter,
        title: "Discounts",
        purpose: "cartTotal takes a percentage",
      })
      const anchor = { path: "src/cart/total.ts", side: "new", line: 3 } as const
      yield* draftMutations.addDraft(deletedId, anchor, "Round after the discount?")
      yield* draftMutations.addDraft(keptId, anchor, "Kept.")

      yield* mutations.deleteGuide(deletedId)

      assert.deepStrictEqual(
        yield* Effect.exit(queries.loadGuide(deletedId)),
        Exit.fail(new GuideNotFound({ guideId: deletedId })),
      )
      assert.deepStrictEqual(yield* drafts.listDrafts(deletedId), [])
      assert.deepStrictEqual(
        (yield* queries.listGuides).map((summary) => summary.id),
        [keptId],
      )
      assert.deepStrictEqual(yield* queries.loadHunks(keptId), [couponHunk])
      assert.strictEqual((yield* drafts.listDrafts(keptId)).length, 1)
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("unknown guide id -> GuideNotFound, for the guide and for its hunks", () =>
    Effect.gen(function* () {
      const queries = yield* GuideQueryService
      const missingGuideId = GuideId.make("0b5a8f2e-6c1d-4e7a-9f3b-2d8c4a6e1f90")

      const guideExit = yield* Effect.exit(queries.loadGuide(missingGuideId))
      const hunksExit = yield* Effect.exit(queries.loadHunks(missingGuideId))

      assert.deepStrictEqual(guideExit, Exit.fail(new GuideNotFound({ guideId: missingGuideId })))
      assert.deepStrictEqual(hunksExit, Exit.fail(new GuideNotFound({ guideId: missingGuideId })))
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect("two guides a minute apart -> listed newest first", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const queries = yield* GuideQueryService

      yield* mutations.createGuide(discountGuide)
      yield* TestClock.adjust("1 minute")
      yield* mutations.createGuide({
        ...discountGuide,
        pullRequest: { ...discountGuide.pullRequest, number: 517 },
      })
      const summaries = yield* queries.listGuides

      assert.deepStrictEqual(
        summaries.map((summary) => summary.pullRequest.number),
        [517, 482],
      )
    }).pipe(Effect.provide(StorageLayer)),
  )

  it.effect(
    "watching a guide -> the current version first, and always the latest one after a change",
    () =>
      Effect.gen(function* () {
        const mutations = yield* GuideMutationService
        const subscriptions = yield* GuideSubscriptionService
        const guideId = yield* mutations.createGuide(discountGuide)

        // The changes below must happen after the watcher is listening, so wait
        // for its first version before making them.
        const firstVersionSeen = yield* Deferred.make<void>()
        const watcher = yield* subscriptions.watchGuide(guideId).pipe(
          Stream.tap(() => Deferred.succeed(firstVersionSeen, undefined)),
          Stream.takeUntil((guide) => guide.status === "writing"),
          Stream.runCollect,
          Effect.forkChild,
        )
        yield* Deferred.await(firstVersionSeen)
        yield* mutations.setOverview(guideId, {
          summary: "Cart totals now take a discount.",
          diagram: null,
        })
        yield* mutations.setGuideStatus(guideId, "writing", null)
        const versions = Array.from(yield* Fiber.join(watcher))

        // Each change triggers a reload of the guide as it is then, so two quick
        // changes may arrive as one version. The watcher never misses the last.
        const firstVersion = versions[0]
        const lastVersion = versions[versions.length - 1]
        assert.deepStrictEqual([firstVersion?.status, firstVersion?.summary], ["planning", null])
        assert.deepStrictEqual(
          [lastVersion?.status, lastVersion?.summary],
          ["writing", "Cart totals now take a discount."],
        )
      }).pipe(Effect.provide(StorageLayer)),
  )

  // Regression: every change queued a reload of its own, so a watcher slower
  // than the writes fell further behind with each one.
  it.live("50 changes while the watcher is busy -> a few versions, not one per change", () =>
    Effect.gen(function* () {
      const mutations = yield* GuideMutationService
      const subscriptions = yield* GuideSubscriptionService
      const guideId = yield* mutations.createGuide(discountGuide)

      const versionsSeen = yield* Ref.make(0)
      const firstVersionSeen = yield* Deferred.make<void>()
      const watcherFree = yield* Deferred.make<void>()
      const watcher = yield* subscriptions.watchGuide(guideId).pipe(
        Stream.tap(() =>
          Ref.update(versionsSeen, (count) => count + 1).pipe(
            Effect.andThen(Deferred.succeed(firstVersionSeen, undefined)),
            Effect.andThen(Deferred.await(watcherFree)),
          ),
        ),
        Stream.runDrain,
        Effect.forkChild,
      )
      yield* Deferred.await(firstVersionSeen)
      for (let change = 1; change <= 50; change++) {
        yield* mutations.setOverview(guideId, { summary: `Change ${change}`, diagram: null })
      }
      yield* Deferred.succeed(watcherFree, undefined)
      // Long enough for 50 reloads of a small in-memory guide many times over.
      yield* Effect.sleep("300 millis")
      yield* Fiber.interrupt(watcher)

      assert.isAtMost(yield* Ref.get(versionsSeen), 3)
    }).pipe(Effect.provide(StorageLayer)),
  )
})

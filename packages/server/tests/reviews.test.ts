import { assert, describe, it } from "@effect/vitest"
import { GuideId, GuideNotFound, SubmitFailed } from "@proofroom/protocol"
import { Effect, Exit, Layer } from "effect"
import { reviewRequestBody } from "../src/github/GitHubService.ts"
import { ReviewService } from "../src/reviews/ReviewService.ts"
import { GuideMutationService } from "../src/storage/guides/GuideMutationService.ts"
import { DraftMutationService } from "../src/storage/reviews/DraftMutationService.ts"
import { DraftQueryService } from "../src/storage/reviews/DraftQueryService.ts"
import { makeStorageLayer } from "../src/storage/StorageLayer.ts"
import { FakeGitHub } from "./fixtures/FakeGitHub.ts"

// Real storage on an in-memory database, and a fake GitHub that keeps what it
// is sent.
function reviewLayer(github: FakeGitHub) {
  return ReviewService.layer.pipe(
    Layer.provideMerge(makeStorageLayer(":memory:")),
    Layer.provide(github.layer),
  )
}

const headSha = "9f3c1e2a7b4d5c6e8f0a1b2c3d4e5f6a7b8c9d0e"

// A guide for pull request 482, as the planner would have left it.
function createDiscountGuide() {
  return Effect.gen(function* () {
    const mutations = yield* GuideMutationService
    return yield* mutations.createGuide({
      pullRequest: { owner: "acme", repo: "checkout", number: 482 },
      title: "Add percentage discounts to cart totals",
      headSha,
      mergeBaseSha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      cli: "claude",
    })
  })
}

const roundingLine = { path: "src/cart/total.ts", side: "new", line: 3 } as const
const removedReturnLine = { path: "src/cart/total.ts", side: "old", line: 6 } as const

describe("draft comments", () => {
  it.effect("added, edited and deleted -> listed in the order written, with the edits", () => {
    const github = new FakeGitHub()
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const drafts = yield* DraftQueryService
      const draftMutations = yield* DraftMutationService
      const guideId = yield* createDiscountGuide()

      const rounding = yield* reviews.addDraft(
        guideId,
        roundingLine,
        "Round before or after the discount?",
      )
      const removed = yield* reviews.addDraft(
        guideId,
        removedReturnLine,
        "Was anything relying on this?",
      )
      const typo = yield* reviews.addDraft(guideId, roundingLine, "Typo")
      yield* draftMutations.updateDraft(
        rounding.id,
        "Round after the discount, so 33.333 becomes 33.",
      )
      yield* draftMutations.deleteDraft(typo.id)
      const listed = yield* drafts.listDrafts(guideId)

      assert.deepStrictEqual(
        listed.map((draft) => [draft.id, draft.anchor, draft.body]),
        [
          [rounding.id, roundingLine, "Round after the discount, so 33.333 becomes 33."],
          [removed.id, removedReturnLine, "Was anything relying on this?"],
        ],
      )
    }).pipe(Effect.provide(reviewLayer(github)))
  })

  it.effect("on a guide that doesn't exist -> GuideNotFound, nothing saved", () => {
    const github = new FakeGitHub()
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const missingGuideId = GuideId.make("0b5a8f2e-6c1d-4e7a-9f3b-2d8c4a6e1f90")

      const exit = yield* Effect.exit(
        reviews.addDraft(missingGuideId, roundingLine, "Lost comment"),
      )

      assert.deepStrictEqual(exit, Exit.fail(new GuideNotFound({ guideId: missingGuideId })))
    }).pipe(Effect.provide(reviewLayer(github)))
  })
})

describe("submitting a review", () => {
  it.effect(
    "drafts and a verdict -> GitHub gets them as one review at the guide's commit, drafts cleared",
    () => {
      const github = new FakeGitHub()
      return Effect.gen(function* () {
        const reviews = yield* ReviewService
        const drafts = yield* DraftQueryService
        const guideId = yield* createDiscountGuide()
        yield* reviews.addDraft(guideId, roundingLine, "Round after the discount, please.")

        const reviewUrl = yield* reviews.submit(
          guideId,
          "request-changes",
          "One rounding question.",
        )

        assert.strictEqual(
          reviewUrl,
          "https://github.com/acme/checkout/pull/482#pullrequestreview-1",
        )
        assert.deepStrictEqual(github.submittedReviews, [
          {
            pullRequest: { owner: "acme", repo: "checkout", number: 482 },
            review: {
              commitSha: headSha,
              verdict: "request-changes",
              summary: "One rounding question.",
              comments: [{ anchor: roundingLine, body: "Round after the discount, please." }],
            },
          },
        ])
        assert.deepStrictEqual(yield* drafts.listDrafts(guideId), [])
      }).pipe(Effect.provide(reviewLayer(github)))
    },
  )

  it.effect("drafts written or edited while the review is sent -> kept for the next review", () => {
    const github = new FakeGitHub()
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const drafts = yield* DraftQueryService
      const draftMutations = yield* DraftMutationService
      const guideId = yield* createDiscountGuide()
      const sent = yield* reviews.addDraft(guideId, roundingLine, "Round after the discount?")
      const edited = yield* reviews.addDraft(
        guideId,
        removedReturnLine,
        "Anything relying on this?",
      )
      github.whileSubmitting = Effect.gen(function* () {
        yield* reviews.addDraft(guideId, roundingLine, "Also: name the magic 100.")
        yield* draftMutations.updateDraft(edited.id, "Was anything relying on this return?")
      }).pipe(Effect.orDie)

      yield* reviews.submit(guideId, "comment", "Two questions.")

      const kept = yield* drafts.listDrafts(guideId)
      assert.deepStrictEqual(
        kept.map((draft) => draft.body),
        ["Was anything relying on this return?", "Also: name the magic 100."],
      )
      assert.notInclude(
        kept.map((draft) => draft.id),
        sent.id,
      )
    }).pipe(Effect.provide(reviewLayer(github)))
  })

  it.effect("approval with no summary -> sent; GitHub doesn't need one to approve", () => {
    const github = new FakeGitHub()
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const guideId = yield* createDiscountGuide()

      yield* reviews.submit(guideId, "approve", "")

      assert.deepStrictEqual(
        github.submittedReviews.map(({ review }) => [review.verdict, review.summary]),
        [["approve", ""]],
      )
    }).pipe(Effect.provide(reviewLayer(github)))
  })

  it.effect("comment with no summary -> SubmitFailed, nothing sent, drafts kept", () => {
    const github = new FakeGitHub()
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const drafts = yield* DraftQueryService
      const guideId = yield* createDiscountGuide()
      yield* reviews.addDraft(guideId, roundingLine, "Round after the discount, please.")

      const exit = yield* Effect.exit(reviews.submit(guideId, "comment", "  "))

      assert.deepStrictEqual(
        exit,
        Exit.fail(new SubmitFailed({ message: "Write a summary to comment or request changes." })),
      )
      assert.deepStrictEqual(github.submittedReviews, [])
      assert.strictEqual((yield* drafts.listDrafts(guideId)).length, 1)
    }).pipe(Effect.provide(reviewLayer(github)))
  })

  it.effect("GitHub refuses -> SubmitFailed with GitHub's reason, drafts kept", () => {
    const github = new FakeGitHub({ refuseReviewsWith: "Can not approve your own pull request" })
    return Effect.gen(function* () {
      const reviews = yield* ReviewService
      const drafts = yield* DraftQueryService
      const guideId = yield* createDiscountGuide()
      yield* reviews.addDraft(guideId, roundingLine, "Looks right.")

      const error = yield* Effect.flip(reviews.submit(guideId, "approve", ""))

      assert.deepStrictEqual(
        error,
        new SubmitFailed({ message: "Can not approve your own pull request" }),
      )
      assert.strictEqual((yield* drafts.listDrafts(guideId)).length, 1)
    }).pipe(Effect.provide(reviewLayer(github)))
  })
})

describe("reviewRequestBody", () => {
  it("review -> GitHub's event name, and LEFT for old lines, RIGHT for new ones", () => {
    const body = reviewRequestBody({
      commitSha: headSha,
      verdict: "request-changes",
      summary: "Two questions about rounding.",
      comments: [
        { anchor: roundingLine, body: "Round after the discount?" },
        { anchor: removedReturnLine, body: "Was anything relying on this?" },
      ],
    })

    assert.deepStrictEqual(body, {
      commit_id: headSha,
      event: "REQUEST_CHANGES",
      body: "Two questions about rounding.",
      comments: [
        { path: "src/cart/total.ts", line: 3, side: "RIGHT", body: "Round after the discount?" },
        { path: "src/cart/total.ts", line: 6, side: "LEFT", body: "Was anything relying on this?" },
      ],
    })
  })
})

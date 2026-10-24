import {
  SubmitFailed,
  type CommentAnchor,
  type DraftComment,
  type GuideId,
  type GuideNotFound,
  type ReviewVerdict,
} from "@proofroom/protocol"
import { Context, Effect, Layer } from "effect"
import { GitHubService } from "../github/GitHubService.ts"
import { GuideQueryService } from "../storage/guides/GuideQueryService.ts"
import { DraftMutationService } from "../storage/reviews/DraftMutationService.ts"
import { DraftQueryService } from "../storage/reviews/DraftQueryService.ts"

// Reviewing a pull request from its guide. Comments wait as drafts in
// Proofroom; submitting sends the summary, the verdict and every draft to
// GitHub as one review, as the user, then clears the drafts.
//
// A review is made against the commit the guide explains, so comments land on
// the lines the reader saw, even if the pull request has moved on since.
//
// Storage and GitHub are left for the caller to provide, as for
// GuideGenerationService.

export interface Reviews {
  readonly addDraft: (
    guideId: GuideId,
    anchor: CommentAnchor,
    body: string,
  ) => Effect.Effect<DraftComment, GuideNotFound>
  // Returns the review's URL on github.com.
  readonly submit: (
    guideId: GuideId,
    verdict: ReviewVerdict,
    summary: string,
  ) => Effect.Effect<string, GuideNotFound | SubmitFailed>
}

export class ReviewService extends Context.Service<ReviewService, Reviews>()(
  "proofroom/reviews/ReviewService",
) {
  static readonly layer = Layer.effect(ReviewService, makeReviewService())
}

// A function declaration, so the layer above can use it before this line.
function makeReviewService() {
  return Effect.gen(function* () {
    const github = yield* GitHubService
    const guides = yield* GuideQueryService
    const drafts = yield* DraftQueryService
    const draftMutations = yield* DraftMutationService

    const addDraft = (guideId: GuideId, anchor: CommentAnchor, body: string) =>
      guides.loadGuide(guideId).pipe(Effect.andThen(draftMutations.addDraft(guideId, anchor, body)))

    const submit = (guideId: GuideId, verdict: ReviewVerdict, summary: string) =>
      Effect.gen(function* () {
        const guide = yield* guides.loadGuide(guideId)
        yield* checkReviewCanBeSent(verdict, summary)
        const comments = yield* drafts.listDrafts(guideId)

        const reviewUrl = yield* github
          .submitReview(guide.pullRequest, {
            commitSha: guide.headSha,
            verdict,
            summary,
            comments: comments.map(({ anchor, body }) => ({ anchor, body })),
          })
          .pipe(Effect.mapError((error) => new SubmitFailed({ message: error.message })))

        // Only after GitHub has the review: a failed submit keeps every draft.
        yield* draftMutations.deleteDraftsOfGuide(guideId)
        yield* Effect.logInfo("review submitted", { guideId, verdict, comments: comments.length })
        return reviewUrl
      })

    return ReviewService.of({ addDraft, submit })
  })
}

// GitHub's own rule, checked before calling it so the reason reads well:
// commenting or requesting changes needs a summary; approving doesn't.
function checkReviewCanBeSent(verdict: ReviewVerdict, summary: string) {
  const needsSummary = verdict !== "approve" && summary.trim() === ""
  if (needsSummary) {
    return Effect.fail(
      new SubmitFailed({ message: "Write a summary to comment or request changes." }),
    )
  }
  return Effect.void
}

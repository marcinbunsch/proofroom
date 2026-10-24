import type { PullRequestRef } from "@proofroom/protocol"
import { Effect, Layer } from "effect"
import { GitHubFailed, GitHubService, type ReviewToSubmit } from "../../src/github/GitHubService.ts"
import { discountDetails } from "./checkout-origin.ts"

// GitHub as the tests see it. GitHubService is the one part of the server that
// talks to the network, so tests replace it with this: it answers with pull
// request 482's details, and keeps every review it is sent for the test to
// read, unless it was told to refuse them.

export interface SubmittedReview {
  readonly pullRequest: PullRequestRef
  readonly review: ReviewToSubmit
}

export class FakeGitHub {
  readonly submittedReviews: Array<SubmittedReview> = []
  // Runs while a review is being sent, as the user might keep writing then.
  whileSubmitting: Effect.Effect<void> = Effect.void

  // `refuseReviewsWith`: the message gh would fail with, e.g. GitHub refusing
  // an approval of your own pull request.
  constructor(private readonly options: { readonly refuseReviewsWith?: string } = {}) {}

  get layer() {
    return Layer.succeed(
      GitHubService,
      GitHubService.of({
        fetchPullRequest: () => Effect.succeed(discountDetails),
        submitReview: (pullRequest, review) => this.submitReview(pullRequest, review),
      }),
    )
  }

  private submitReview(pullRequest: PullRequestRef, review: ReviewToSubmit) {
    const refusal = this.options.refuseReviewsWith
    if (refusal !== undefined) return Effect.fail(new GitHubFailed({ message: refusal }))
    return this.whileSubmitting.pipe(
      Effect.map(() => {
        this.submittedReviews.push({ pullRequest, review })
        return `https://github.com/acme/checkout/pull/482#pullrequestreview-${this.submittedReviews.length}`
      }),
    )
  }
}

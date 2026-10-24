import type { CommentAnchor, PullRequestRef, ReviewVerdict } from "@proofroom/protocol"
import { Context, Effect, Layer, Schema } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { runCommand } from "../process/run-command.ts"

// Everything Proofroom asks GitHub, through the `gh` command-line tool, so it
// never holds a token.

export class GitHubFailed extends Schema.TaggedError<GitHubFailed>()("GitHubFailed", {
  message: Schema.String,
}) {}

// What a guide needs to know about a pull request beyond its code.
export const PullRequestDetails = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  baseRefName: Schema.String,
  commits: Schema.Array(
    Schema.Struct({ messageHeadline: Schema.String, messageBody: Schema.String }),
  ),
})
export type PullRequestDetails = typeof PullRequestDetails.Type

// A review as Proofroom submits it: a summary, a verdict, and the comments on
// lines, all against the commit the guide explained.
export interface ReviewToSubmit {
  readonly commitSha: string
  readonly verdict: ReviewVerdict
  readonly summary: string
  readonly comments: ReadonlyArray<{ readonly anchor: CommentAnchor; readonly body: string }>
}

export interface GitHub {
  readonly fetchPullRequest: (
    pullRequest: PullRequestRef,
  ) => Effect.Effect<PullRequestDetails, GitHubFailed>
  // Posts the review as the user and returns its URL on github.com.
  readonly submitReview: (
    pullRequest: PullRequestRef,
    review: ReviewToSubmit,
  ) => Effect.Effect<string, GitHubFailed>
}

export class GitHubService extends Context.Service<GitHubService, GitHub>()(
  "proofroom/github/GitHubService",
) {
  static readonly layer = Layer.effect(GitHubService, makeGitHubService())
}

// A function declaration, so the layer above can use it before this line.
function makeGitHubService() {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const fetchPullRequest = (pullRequest: PullRequestRef) =>
      runCommand(spawner, {
        executable: "gh",
        args: [
          "pr",
          "view",
          String(pullRequest.number),
          "--repo",
          `${pullRequest.owner}/${pullRequest.repo}`,
          "--json",
          "title,body,baseRefName,commits",
        ],
      }).pipe(
        Effect.flatMap(decodePullRequestDetails),
        Effect.mapError((error) => new GitHubFailed({ message: error.message })),
      )

    // The review goes in as JSON on stdin: a big review's comments could exceed
    // the limit on command-line arguments.
    const submitReview = (pullRequest: PullRequestRef, review: ReviewToSubmit) =>
      runCommand(spawner, {
        executable: "gh",
        args: [
          "api",
          "--method",
          "POST",
          `repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}/reviews`,
          "--input",
          "-",
        ],
        stdin: JSON.stringify(reviewRequestBody(review)),
      }).pipe(
        Effect.flatMap(decodeSubmittedReview),
        Effect.map((submitted) => submitted.html_url),
        Effect.mapError((error) => new GitHubFailed({ message: error.message })),
      )

    return GitHubService.of({ fetchPullRequest, submitReview })
  })
}

// gh prints more fields per commit than these; the extra ones are ignored.
const decodePullRequestDetails = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PullRequestDetails),
)

// --- reviews -------------------------------------------------------------------------

// The body of GitHub's "create a review" call, in GitHub's own terms: its
// event names, and LEFT for the old file, RIGHT for the new one.
export function reviewRequestBody(review: ReviewToSubmit) {
  return {
    commit_id: review.commitSha,
    event: githubEvents[review.verdict],
    body: review.summary,
    comments: review.comments.map(({ anchor, body }) => ({
      path: anchor.path,
      line: anchor.line,
      side: anchor.side === "old" ? "LEFT" : "RIGHT",
      body,
    })),
  }
}

const githubEvents: Record<ReviewVerdict, string> = {
  comment: "COMMENT",
  approve: "APPROVE",
  "request-changes": "REQUEST_CHANGES",
}

// GitHub answers with the whole review; only its address is needed.
const decodeSubmittedReview = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ html_url: Schema.String })),
)

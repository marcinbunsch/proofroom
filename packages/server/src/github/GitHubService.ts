import type { CommentAnchor, PullRequestRef, ReviewVerdict } from "@proofroom/protocol"
import { Context, Effect, Layer, Option, Schema, type PlatformError } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { runCommand, type CommandFailed } from "../process/run-command.ts"

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
      runGh(spawner, [
        "pr",
        "view",
        String(pullRequest.number),
        "--repo",
        `${pullRequest.owner}/${pullRequest.repo}`,
        "--json",
        "title,body,baseRefName,commits",
      ]).pipe(Effect.flatMap(decodeGhOutput(PullRequestDetails)))

    // The review goes in as JSON on stdin: a big review's comments could exceed
    // the limit on command-line arguments. A refused review is logged with
    // what was sent, since GitHub's reason usually points into it, e.g. a
    // comment on a line that isn't in the diff.
    const submitReview = (pullRequest: PullRequestRef, review: ReviewToSubmit) =>
      runGh(
        spawner,
        [
          "api",
          "--method",
          "POST",
          `repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}/reviews`,
          "--input",
          "-",
        ],
        JSON.stringify(reviewRequestBody(review)),
      ).pipe(
        Effect.tapError((error) =>
          Effect.logError("GitHub refused a review", {
            reason: error.message,
            pullRequest,
            review: reviewRequestBody(review),
          }),
        ),
        Effect.flatMap(decodeGhOutput(SubmittedReview)),
        Effect.map((submitted) => submitted.html_url),
      )

    return GitHubService.of({ fetchPullRequest, submitReview })
  })
}

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
const SubmittedReview = Schema.Struct({ html_url: Schema.String })

// --- gh ------------------------------------------------------------------------------

// Runs gh, failing with GitHub's own reason when it refuses.
function runGh(
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  args: ReadonlyArray<string>,
  stdin?: string,
) {
  return runCommand(spawner, { executable: "gh", args, stdin }).pipe(
    Effect.mapError((error) => new GitHubFailed({ message: githubReason(error) })),
  )
}

// gh prints JSON; fields beyond the schema's are ignored.
function decodeGhOutput<A>(schema: Schema.Codec<A>) {
  return (output: string) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(output).pipe(
      Effect.mapError(
        (error) =>
          new GitHubFailed({ message: `gh printed something unexpected: ${error.message}` }),
      ),
    )
}

// Why GitHub refused a call, in its own words. `gh api` prints GitHub's error
// response on stdout, e.g. {"message": "Unprocessable Entity", "errors":
// ["Review Can not approve your own pull request"]}, and only "HTTP 422" on
// stderr. Falls back to stderr when there is no response to read.
export function githubReason(error: CommandFailed | PlatformError.PlatformError): string {
  if (error._tag !== "CommandFailed") return error.message
  const response = Schema.decodeUnknownOption(Schema.fromJsonString(GitHubErrorResponse))(
    error.stdout,
  )
  if (Option.isNone(response)) return error.message
  const { message, errors = [] } = response.value
  const details = errors.map((detail) =>
    typeof detail === "string"
      ? detail
      : (detail.message ?? [detail.field, detail.code].filter(Boolean).join(" ")),
  )
  return details.length === 0 ? message : `${message}: ${details.join("; ")}`
}

const GitHubErrorResponse = Schema.Struct({
  message: Schema.String,
  errors: Schema.optional(
    Schema.Array(
      Schema.Union([
        Schema.String,
        Schema.Struct({
          message: Schema.optional(Schema.String),
          field: Schema.optional(Schema.String),
          code: Schema.optional(Schema.String),
        }),
      ]),
    ),
  ),
})

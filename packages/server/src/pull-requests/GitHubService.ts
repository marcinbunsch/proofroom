import type { PullRequestRef } from "@proofroom/protocol"
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

export interface GitHub {
  readonly fetchPullRequest: (
    pullRequest: PullRequestRef,
  ) => Effect.Effect<PullRequestDetails, GitHubFailed>
}

export class GitHubService extends Context.Service<GitHubService, GitHub>()(
  "proofroom/pull-requests/GitHubService",
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

    return GitHubService.of({ fetchPullRequest })
  })
}

// gh prints more fields per commit than these; the extra ones are ignored.
const decodePullRequestDetails = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PullRequestDetails),
)

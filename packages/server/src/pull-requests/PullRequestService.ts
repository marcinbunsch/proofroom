import type { Hunk, PullRequestRef } from "@proofroom/protocol"
import { Context, Effect, Layer, Semaphore, type Scope } from "effect"
import { GitFailed, GitService } from "./GitService.ts"
import { GitHubFailed, GitHubService } from "./GitHubService.ts"
import { InvalidPullRequestUrl, parsePullRequestUrl } from "./pull-request-url.ts"

// Turns a pull request URL into what a guide is written from: the pull
// request's description, its exact commits, and its diff split into hunks.
//
// The layer brings GitService with it. GitHubService is left for the caller to
// provide, because it talks to the network: the app gives it the real one,
// tests give it a fake.

export interface LoadedPullRequest {
  readonly pullRequest: PullRequestRef
  readonly title: string
  readonly description: string
  readonly commitMessages: ReadonlyArray<string>
  // Proofroom's own clone, where the commits below exist.
  readonly repositoryPath: string
  readonly headSha: string
  // Where the pull request branched off its base. The diff is taken from
  // here, so changes that landed on the base since don't show up in it.
  readonly mergeBaseSha: string
  readonly hunks: ReadonlyArray<Hunk>
}

export type LoadFailed = InvalidPullRequestUrl | GitHubFailed | GitFailed

export interface PullRequests {
  readonly load: (pullRequestUrl: string) => Effect.Effect<LoadedPullRequest, LoadFailed>
  // A checkout of the pull request's head for agents to read, removed when the
  // surrounding scope closes.
  readonly checkOutHead: (
    loaded: LoadedPullRequest,
  ) => Effect.Effect<string, GitFailed, Scope.Scope>
}

export class PullRequestService extends Context.Service<PullRequestService, PullRequests>()(
  "proofroom/pull-requests/PullRequestService",
) {
  static readonly layer = Layer.effect(PullRequestService, makePullRequestService()).pipe(
    Layer.provide(GitService.layer),
  )
}

// A function declaration, so the layer above can use it before this line.
function makePullRequestService() {
  return Effect.gen(function* () {
    const github = yield* GitHubService
    const git = yield* GitService
    // Cloning and fetching take turns: two at once in the same clone would
    // race on git's lock files. One lock for all repositories keeps it simple;
    // a fetch takes seconds and guides are started by hand.
    const cloneAndFetchLock = yield* Semaphore.make(1)

    const load = (pullRequestUrl: string) =>
      Effect.gen(function* () {
        const pullRequest = yield* parsePullRequestUrl(pullRequestUrl)
        const details = yield* github.fetchPullRequest(pullRequest)
        const { repositoryPath, fetched } = yield* cloneAndFetchLock.withPermit(
          Effect.gen(function* () {
            const repositoryPath = yield* git.ensureClone(pullRequest)
            const fetched = yield* git.fetchPullRequest(
              repositoryPath,
              pullRequest,
              details.baseRefName,
            )
            return { repositoryPath, fetched }
          }),
        )
        const mergeBaseSha = yield* git.mergeBase(repositoryPath, fetched.baseSha, fetched.headSha)
        const hunks = yield* git.diffHunks(repositoryPath, mergeBaseSha, fetched.headSha)
        return {
          pullRequest,
          title: details.title,
          description: details.body,
          commitMessages: details.commits.map(formatCommitMessage),
          repositoryPath,
          headSha: fetched.headSha,
          mergeBaseSha,
          hunks,
        }
      })

    const checkOutHead = (loaded: LoadedPullRequest) =>
      git.worktree(loaded.repositoryPath, loaded.headSha)

    return PullRequestService.of({ load, checkOutHead })
  })
}

function formatCommitMessage(commit: {
  readonly messageHeadline: string
  readonly messageBody: string
}) {
  return commit.messageBody === ""
    ? commit.messageHeadline
    : `${commit.messageHeadline}\n\n${commit.messageBody}`
}

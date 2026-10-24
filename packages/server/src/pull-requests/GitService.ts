import { mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { Hunk, PullRequestRef } from "@proofroom/protocol"
import { Context, Effect, Layer, Schema, type Scope } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { AppPaths } from "../AppPaths.ts"
import { GitRemoteUrl } from "./GitRemoteUrl.ts"
import { parseUnifiedDiff } from "./parse-diff.ts"
import { runGit } from "./run-git.ts"

// Proofroom's own git work: one bare clone per repository, fetched before each
// guide, and a throwaway worktree for the agents to read. Nothing here commits,
// pushes, or touches the user's own checkouts.
//
// Two loads of the same repository at once would race on git's lock files
// while cloning or fetching; PullRequestService makes sure they take turns.

export class GitFailed extends Schema.TaggedError<GitFailed>()("GitFailed", {
  message: Schema.String,
}) {}

export interface FetchedPullRequest {
  // The commits git actually fetched, which can be newer than what gh
  // reported if someone pushed in between.
  readonly headSha: string
  readonly baseSha: string
}

export interface Git {
  readonly ensureClone: (pullRequest: PullRequestRef) => Effect.Effect<string, GitFailed>
  readonly fetchPullRequest: (
    repositoryPath: string,
    pullRequest: PullRequestRef,
    baseRefName: string,
  ) => Effect.Effect<FetchedPullRequest, GitFailed>
  readonly mergeBase: (
    repositoryPath: string,
    firstSha: string,
    secondSha: string,
  ) => Effect.Effect<string, GitFailed>
  readonly diffHunks: (
    repositoryPath: string,
    fromSha: string,
    toSha: string,
  ) => Effect.Effect<Array<Hunk>, GitFailed>
  // A checkout of `sha` that exists until the surrounding scope closes.
  readonly worktree: (
    repositoryPath: string,
    sha: string,
  ) => Effect.Effect<string, GitFailed, Scope.Scope>
}

export class GitService extends Context.Service<GitService, Git>()(
  "proofroom/pull-requests/GitService",
) {
  static readonly layer = Layer.effect(GitService, makeGitService())
}

// A function declaration, so the layer above can use it before this line.
function makeGitService() {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const paths = yield* AppPaths
    const remoteUrlFor = yield* GitRemoteUrl

    const git: RunGit = (args, cwd) =>
      runGit(spawner, args, cwd).pipe(
        Effect.mapError((error) => new GitFailed({ message: error.message })),
      )

    return GitService.of({
      ensureClone: (pullRequest) =>
        ensureClone(git, clonePath(paths.repositories, pullRequest), remoteUrlFor(pullRequest)),
      fetchPullRequest: (repositoryPath, pullRequest, baseRefName) =>
        fetchPullRequest(git, repositoryPath, pullRequest, baseRefName),
      mergeBase: (repositoryPath, firstSha, secondSha) =>
        mergeBase(git, repositoryPath, firstSha, secondSha),
      diffHunks: (repositoryPath, fromSha, toSha) => diffHunks(git, repositoryPath, fromSha, toSha),
      worktree: (repositoryPath, sha) => worktree(git, paths.worktrees, repositoryPath, sha),
    })
  })
}

type RunGit = (args: ReadonlyArray<string>, cwd?: string) => Effect.Effect<string, GitFailed>

// --- clone and fetch ---------------------------------------------------------------

function clonePath(repositoriesFolder: string, pullRequest: PullRequestRef): string {
  return join(repositoriesFolder, pullRequest.owner, `${pullRequest.repo}.git`)
}

// A full clone, not a blobless one: agents run `git log` and `git blame` with
// no network, so every object has to be here already.
function ensureClone(git: RunGit, repositoryPath: string, remoteUrl: string) {
  return Effect.gen(function* () {
    const isCloned = yield* git(["rev-parse", "--git-dir"], repositoryPath).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )
    if (isCloned) return repositoryPath

    yield* Effect.promise(() => mkdir(dirname(repositoryPath), { recursive: true }))
    yield* git([...githubCredentials, "clone", "--bare", "--quiet", remoteUrl, repositoryPath])
    yield* Effect.logInfo("cloned repository", { remoteUrl, repositoryPath })
    return repositoryPath
  })
}

// Fetches the pull request's head and its base branch into refs of
// Proofroom's own, then reads which commits they point at.
function fetchPullRequest(
  git: RunGit,
  repositoryPath: string,
  pullRequest: PullRequestRef,
  baseRefName: string,
) {
  return Effect.gen(function* () {
    const headRef = `refs/proofroom/pull/${pullRequest.number}`
    const baseRef = `refs/proofroom/base/${baseRefName}`
    yield* git(
      [
        ...githubCredentials,
        "fetch",
        "--quiet",
        "origin",
        `+refs/pull/${pullRequest.number}/head:${headRef}`,
        `+refs/heads/${baseRefName}:${baseRef}`,
      ],
      repositoryPath,
    )
    const headSha = yield* readSha(git, repositoryPath, headRef)
    const baseSha = yield* readSha(git, repositoryPath, baseRef)
    return { headSha, baseSha }
  })
}

function readSha(git: RunGit, repositoryPath: string, ref: string) {
  return git(["rev-parse", "--verify", `${ref}^{commit}`], repositoryPath).pipe(
    Effect.map((output) => output.trim()),
  )
}

// --- reading -----------------------------------------------------------------------

function mergeBase(git: RunGit, repositoryPath: string, firstSha: string, secondSha: string) {
  return git(["merge-base", firstSha, secondSha], repositoryPath).pipe(
    Effect.map((output) => output.trim()),
  )
}

// Every option that changes how the diff is printed is set here, so
// parseUnifiedDiff sees the same format whatever the user's git setup.
function diffHunks(git: RunGit, repositoryPath: string, fromSha: string, toSha: string) {
  const args = [
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--find-renames",
    "--unified=3",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    fromSha,
    toSha,
  ]
  return git(args, repositoryPath).pipe(Effect.map(parseUnifiedDiff))
}

function worktree(git: RunGit, worktreesFolder: string, repositoryPath: string, sha: string) {
  const worktreePath = join(worktreesFolder, `${sha.slice(0, 12)}-${crypto.randomUUID()}`)
  const addWorktree = Effect.gen(function* () {
    yield* Effect.promise(() => mkdir(worktreesFolder, { recursive: true }))
    yield* git(["worktree", "add", "--detach", "--quiet", worktreePath, sha], repositoryPath)
    return worktreePath
  })
  // If git can't remove the worktree, the folder is deleted directly; the
  // leftover entry in git's list is harmless and `git worktree prune` clears it.
  const removeWorktree = git(["worktree", "remove", "--force", worktreePath], repositoryPath).pipe(
    Effect.catch(() => Effect.promise(() => rm(worktreePath, { recursive: true, force: true }))),
  )
  return Effect.acquireRelease(addWorktree, () => removeWorktree)
}

// --- git settings ------------------------------------------------------------------

// Cloning and fetching sign in through `gh`, so Proofroom never sees a token.
const githubCredentials = ["-c", "credential.helper=!gh auth git-credential"]

import type { PullRequestRef } from "@proofroom/protocol"
import { Context } from "effect"

// Where Proofroom clones a pull request's repository from. GitHub, unless a
// test points it at a repository on disk.
export const GitRemoteUrl = Context.Reference<(pullRequest: PullRequestRef) => string>(
  "proofroom/pull-requests/GitRemoteUrl",
  {
    defaultValue: () => (pullRequest) =>
      `https://github.com/${pullRequest.owner}/${pullRequest.repo}.git`,
  },
)

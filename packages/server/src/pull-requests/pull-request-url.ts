import type { PullRequestRef } from "@proofroom/protocol"
import { Effect, Schema } from "effect"

export class InvalidPullRequestUrl extends Schema.TaggedError<InvalidPullRequestUrl>()(
  "InvalidPullRequestUrl",
  { message: Schema.String },
) {}

// https://github.com/acme/checkout/pull/482, optionally followed by a tab
// (/files), a query or an anchor, as copied from the browser.
const pullRequestUrlPattern =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/

export function parsePullRequestUrl(
  url: string,
): Effect.Effect<PullRequestRef, InvalidPullRequestUrl> {
  const match = pullRequestUrlPattern.exec(url.trim())
  if (match === null) {
    return Effect.fail(
      new InvalidPullRequestUrl({
        message: `${url} is not a GitHub pull request URL. Expected https://github.com/owner/repo/pull/123.`,
      }),
    )
  }
  const [, owner = "", repo = "", number = ""] = match
  return Effect.succeed({ owner, repo, number: Number(number) })
}

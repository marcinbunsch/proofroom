import { describe, expect, it } from "@effect/vitest"
import { githubReason } from "../src/github/GitHubService.ts"
import { CommandFailed } from "../src/process/run-command.ts"

// What `gh api` leaves behind when GitHub refuses: GitHub's response on stdout,
// and only the status on stderr.
function ghRefusal(stdout: string) {
  return new CommandFailed({
    command: "gh api --method POST repos/acme/checkout/pulls/482/reviews",
    exitCode: 1,
    stderr: "gh: Unprocessable Entity (HTTP 422)\n",
    stdout,
    message: "gh api --method POST exited with 1: gh: Unprocessable Entity (HTTP 422)",
  })
}

describe("githubReason", () => {
  it("errors as plain strings -> GitHub's message and each error", () => {
    const refusal = ghRefusal(
      JSON.stringify({
        message: "Unprocessable Entity",
        errors: ["Review Can not approve your own pull request"],
        status: "422",
      }),
    )

    expect(githubReason(refusal)).toBe(
      "Unprocessable Entity: Review Can not approve your own pull request",
    )
  })

  it("errors as objects -> their message, or field and code when there is none", () => {
    const refusal = ghRefusal(
      JSON.stringify({
        message: "Validation Failed",
        errors: [
          { resource: "PullRequestReview", message: "Line could not be resolved" },
          { resource: "PullRequestReview", field: "commit_id", code: "invalid" },
        ],
      }),
    )

    expect(githubReason(refusal)).toBe(
      "Validation Failed: Line could not be resolved; commit_id invalid",
    )
  })

  it("no errors listed -> GitHub's message alone", () => {
    expect(githubReason(ghRefusal(JSON.stringify({ message: "Not Found" })))).toBe("Not Found")
  })

  it("nothing readable on stdout -> the command's own message", () => {
    const refusal = ghRefusal("")

    expect(githubReason(refusal)).toBe(refusal.message)
  })
})

import type { LoadedPullRequest } from "../../pull-requests/PullRequestService.ts"
import { hunkSummaryLine } from "../hunk-text.ts"

// What the planner is asked. It plans only: it writes the overview, splits the
// change into chapters, and places every hunk. Chapters are written later, one
// run each.

export function plannerPrompt(pullRequest: LoadedPullRequest): string {
  return `You are planning a guide to a GitHub pull request. A reviewer will read your guide instead of reading every line of the diff, so it has to be accurate, complete and easy to follow.

You are in a checkout of the pull request's latest commit. Read any file you need to understand the change: the code around a hunk, its callers, its tests. You can run git log, git show, git blame and git grep. You cannot change anything.

# The pull request

Title: ${pullRequest.title}

Description:
${pullRequest.description.trim() === "" ? "(none)" : pullRequest.description}

Commits:
${pullRequest.commitMessages.map((message) => `- ${message.split("\n")[0]}`).join("\n")}

# What to do

1. Read the hunks with read_hunks. The list below has every hunk of the diff, one per line. Read them in batches of up to 40.

2. Call set_overview with two plain sentences on what the pull request does and why, and a Mermaid diagram of the part of the system it touches. The diagram should show the pieces involved and how they connect, not every file.

3. Split the change into chapters, one per idea, in the order a reader should meet them, and add each with add_chapter. A chapter is one thing the reader has to understand: "cartTotal takes a discount", "callers pass the coupon's percentage", "the old pricing helper is deleted". Most pull requests need two to eight chapters; a pull request with one idea gets one chapter.

4. Place every hunk with place_hunks. A hunk goes into the chapter it belongs to. Routine changes the reader can trust without reading go into an appendix group instead:
   - renames: moved or renamed code with no change in behaviour
   - generated: generated files
   - lockfiles: dependency lockfiles
   - mechanical: the same small edit repeated across many places, such as updating callers to a new signature
   - tests: tests that only follow the change and teach the reader nothing new
   - formatting: whitespace and formatting only
   Tests that show how the new behaviour works belong in that behaviour's chapter, not the appendix. If one hunk covers two ideas, split it with line ranges.

5. Call finish_plan. It checks that every changed line is placed exactly once. If it lists problems, fix them with place_hunks and call finish_plan again. You are done when finish_plan accepts the plan.

Don't write the chapters themselves. That happens in a separate step, with your outline.

# Mermaid

Put labels that contain brackets, quotes or punctuation in double quotes: A["cartTotal(prices, discountPercent)"]. Keep a diagram to about a dozen boxes.

# The hunks

Each line: hunk id, file, kind of change, lines added and removed, total lines in the hunk, and the code it sits in.

${pullRequest.hunks.map(hunkSummaryLine).join("\n")}
`
}

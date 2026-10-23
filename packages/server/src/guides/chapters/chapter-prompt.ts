import type { Chapter, Guide, Hunk, HunkLineRange } from "@proofroom/protocol"
import type { LoadedPullRequest } from "../../pull-requests/PullRequestService.ts"
import { hunkText } from "../hunk-text.ts"

// What a chapter run is asked: write one chapter of the planned guide, from the
// hunks placed in it, knowing the rest of the outline so chapters don't repeat
// each other.

export interface PlacedHunk {
  readonly hunk: Hunk
  // null: the whole hunk belongs to this chapter.
  readonly lines: HunkLineRange | null
}

export interface ChapterPromptInput {
  readonly pullRequest: LoadedPullRequest
  readonly guide: Guide
  readonly chapter: Chapter
  readonly placedHunks: ReadonlyArray<PlacedHunk>
}

export function chapterPrompt({
  pullRequest,
  guide,
  chapter,
  placedHunks,
}: ChapterPromptInput): string {
  return `You are writing one chapter of a guide to a GitHub pull request. A reviewer reads the guide instead of every line of the diff, so the chapter has to be accurate and easy to follow.

You are in a checkout of the pull request's latest commit. Read any file you need: the code around a hunk, its callers, its tests. You can run git log, git show, git blame and git grep. You cannot change anything.

# The pull request

Title: ${pullRequest.title}

${guide.summary ?? ""}

# The guide's chapters

${guide.chapters.map((other) => outlineLine(other, chapter)).join("\n")}

# Your chapter: ${chapter.title}

${chapter.purpose}

# What to do

1. Call write_chapter with the chapter's text in Markdown. Explain what changed in this chapter and why, in plain short paragraphs. Refer to code by file and function name. Don't walk through the diff line by line; the reader sees the code next to your text. Don't repeat what other chapters cover. Add a Mermaid diagram if it makes the change easier to see, for example how data now flows or how a state changes.

2. Flag lines that deserve the reviewer's close attention with add_flag. Only flag real concerns:
   - risky-logic: logic that is easy to get wrong, such as rounding, concurrency, or edge cases
   - hidden-behaviour-change: behaviour that changes inside what looks like a refactor
   - missing-tests: changed behaviour that no test covers
   - contradicts-description: code that doesn't do what the pull request says it does
   A flag says where to look and why, not what to think. Most chapters need no flags or one or two.

3. Call finish_chapter.

Put Mermaid labels that contain brackets, quotes or punctuation in double quotes: A["cartTotal(prices)"].

# This chapter's hunks

Lines are numbered from 1 within each hunk. add_flag uses these numbers.

${placedHunks.map(({ hunk, lines }) => hunkText(hunk, lines)).join("\n\n")}
`
}

function outlineLine(chapter: Chapter, current: Chapter): string {
  const marker = chapter.key === current.key ? "  ← this chapter" : ""
  return `${chapter.position + 1}. ${chapter.title}: ${chapter.purpose}${marker}`
}

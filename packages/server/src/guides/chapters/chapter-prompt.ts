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

You are in a checkout of the pull request's latest commit. Read any file you need: the code around a hunk, its callers, its tests. To learn why code is the way it is, use git_log, git_show and git_blame. You cannot change anything.

# The pull request

Title: ${pullRequest.title}

${guide.summary ?? ""}

# The guide's chapters

${guide.chapters.map((other) => outlineLine(other, chapter)).join("\n")}

# Your chapter: ${chapter.title}

${chapter.purpose}

# What to do

The reader will not read this chapter's code. The whole diff is one click away for when they want it. Your job is to make them understand the change without it, and to guide their focus to the few places that deserve it.

1. Call write_chapter with the chapter's text in Markdown, at most 150 words. Say what changed, why, and what it means for anyone who uses the code. Refer to code by file and function name. Don't walk through the diff, and don't repeat what other chapters cover.

2. Show the change with add_visual instead of describing it. A visual reads faster than prose, so anything with structure belongs in one:
   - behaviourChange when the code now does something different for some inputs: the situation, what happened before, what happens now. Pick cases that show the difference, such as an edge case or a rounding boundary.
   - apiChange when anything callers see changed: functions, endpoints, config keys, types, each as before and after.
   - flow when the change is about how a request, an event or data moves through the code: mark what was added, changed or removed, and link each node to its file.
   - diagram (free Mermaid) only when none of these fits.
   Up to 3. A chapter that changes nothing a reader needs to picture needs none.

3. Guide the reader's focus with show_code. Pick the lines that are important, interesting or problematic: the heart of a new algorithm, a subtle edge case, a surprising choice, the line a flag is about. Up to 3 excerpts, each up to 15 lines, each with a short \`why\` saying what to notice there. Most chapters need one or two. A chapter of routine changes may need none. If the reader would learn nothing from seeing the lines, don't show them.

4. Flag lines that deserve the reviewer's close attention with add_flag. Only flag real concerns:
   - risky-logic: logic that is easy to get wrong, such as rounding, concurrency, or edge cases
   - hidden-behaviour-change: behaviour that changes inside what looks like a refactor
   - missing-tests: changed behaviour that no test covers
   - contradicts-description: code that doesn't do what the pull request says it does
   A flag says where to look and why, not what to think. Show the flagged lines with show_code too, so the reader sees them. Most chapters need no flags or one or two.

5. Call finish_chapter.

Put Mermaid labels that contain brackets, quotes or punctuation in double quotes: A["cartTotal(prices)"].

# This chapter's hunks

These are for you to read; the reader sees only what you show with show_code. Lines are numbered from 1 within each hunk; show_code and add_flag use these numbers.

${placedHunks.map(({ hunk, lines }) => hunkText(hunk, lines)).join("\n\n")}
`
}

function outlineLine(chapter: Chapter, current: Chapter): string {
  const marker = chapter.key === current.key ? "  ← this chapter" : ""
  return `${chapter.position + 1}. ${chapter.title}: ${chapter.purpose}${marker}`
}

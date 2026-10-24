import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ChapterKey, FlagKind, MermaidDiagram, Placement } from "./guide.ts"
import { HunkId, HunkLineRange } from "./hunk.ts"

// The tools a CLI agent uses to hand a guide back to Proofroom, over MCP. Every
// call is checked against its schema before the handler runs. A handler that
// refuses a call (unknown hunk, broken diagram, lines out of range) fails with
// ToolRejected, and its message goes back to the agent so it can fix the call.

export class ToolRejected extends Schema.TaggedError<ToolRejected>()("ToolRejected", {
  message: Schema.String,
}) {}

// What a tool says back after a successful call, e.g. "Chapter saved."
const Confirmation = Schema.String

// --- planner run -----------------------------------------------------------

// The planner's prompt lists every hunk in one line each. It reads the hunks
// themselves through this tool, in batches, so a pull request with thousands
// of changed lines doesn't have to fit in the prompt.
export const ReadHunks = Tool.make("read_hunks", {
  description:
    "Read hunks of the pull request's diff by id. Each line is numbered from 1 within its hunk; placements and line ranges use these numbers. Read up to 40 hunks per call.",
  parameters: Schema.Struct({
    hunkIds: Schema.Array(HunkId).check(Schema.isMaxLength(40)),
  }),
  success: Schema.String,
  failure: ToolRejected,
})

export const SetOverview = Tool.make("set_overview", {
  description:
    "Set the guide's overview: two plain sentences on what the pull request does, and a Mermaid diagram of the part of the system it touches. Call once; a second call replaces the first.",
  parameters: Schema.Struct({
    summary: Schema.String,
    diagram: Schema.NullOr(MermaidDiagram),
  }),
  success: Confirmation,
  failure: ToolRejected,
})

export const AddChapter = Tool.make("add_chapter", {
  description:
    "Add a chapter to the outline, in reading order. One chapter per idea in the change. `key` is a short lowercase slug (letters, digits, dashes) used to place hunks into it.",
  parameters: Schema.Struct({
    key: ChapterKey,
    title: Schema.String,
    purpose: Schema.String,
  }),
  success: Confirmation,
  failure: ToolRejected,
})

export const PlaceHunks = Tool.make("place_hunks", {
  description:
    "Place hunks into a chapter or an appendix group. Set `lines` to null to place the whole hunk, or give a line range (hunk-local numbers, as shown by read_hunks) to split a hunk that covers two ideas. Placing a hunk again replaces all its earlier placements, so to fix a hunk, place all of it again in one call. Every changed line must end up in exactly one place.",
  parameters: Schema.Struct({ placements: Schema.Array(Placement) }),
  success: Confirmation,
  failure: ToolRejected,
})

export const FinishPlan = Tool.make("finish_plan", {
  description:
    "Call when the outline and placements are complete. Proofroom checks that every changed line is placed exactly once. If anything is missing or placed twice, the problems come back and you must fix them and call finish_plan again.",
  parameters: Tool.EmptyParams,
  success: Confirmation,
  failure: ToolRejected,
})

export const PlannerToolkit = Toolkit.make(
  ReadHunks,
  SetOverview,
  AddChapter,
  PlaceHunks,
  FinishPlan,
)

// --- chapter run -----------------------------------------------------------

export const WriteChapter = Tool.make("write_chapter", {
  description:
    "Write this chapter: a short explanation in Markdown, and optionally one Mermaid diagram. A second call replaces the first.",
  parameters: Schema.Struct({
    body: Schema.String,
    diagram: Schema.NullOr(MermaidDiagram),
  }),
  success: Confirmation,
  failure: ToolRejected,
})

export const AddFlag = Tool.make("add_flag", {
  description:
    "Flag a line in one of this chapter's hunks that deserves the reviewer's close attention. Say where to look and why, not what to think.",
  parameters: Schema.Struct({
    hunkId: HunkId,
    line: Schema.Int,
    kind: FlagKind,
    note: Schema.String,
  }),
  success: Confirmation,
  failure: ToolRejected,
})

export const ShowCode = Tool.make("show_code", {
  description:
    "Guide the reader's focus: show a few lines of this chapter's code that are important, interesting or problematic, such as the heart of a new algorithm, a subtle edge case, or the line a flag is about. The reader won't read the rest; it stays on the Diff tab. Up to 3 excerpts per chapter, each up to 15 lines, from this chapter's hunks, with at least one changed line; line numbers are hunk-local. Say in `why` what the reader should notice there.",
  parameters: Schema.Struct({
    hunkId: HunkId,
    lines: HunkLineRange,
    why: Schema.String,
  }),
  success: Confirmation,
  failure: ToolRejected,
})

export const FinishChapter = Tool.make("finish_chapter", {
  description: "Call once the chapter is written.",
  parameters: Tool.EmptyParams,
  success: Confirmation,
  failure: ToolRejected,
})

export const ChapterToolkit = Toolkit.make(WriteChapter, ShowCode, AddFlag, FinishChapter)

import { Schema } from "effect"
import { HunkId, HunkLineRange } from "./hunk.ts"

export const GuideId = Schema.String.pipe(Schema.brand("GuideId"))
export type GuideId = typeof GuideId.Type

// The key the planner gives a chapter ("rate-limiter", "callers-migrated").
// Placements and chapter runs refer to chapters by it.
export const ChapterKey = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,47}$/)).pipe(
  Schema.brand("ChapterKey"),
)
export type ChapterKey = typeof ChapterKey.Type

export const AgentCli = Schema.Literals(["claude", "codex"])
export type AgentCli = typeof AgentCli.Type

// The kinds of routine change the appendix groups by. Everything the guide
// doesn't explain in a chapter has to land in one of these.
export const AppendixKind = Schema.Literals([
  "renames",
  "generated",
  "lockfiles",
  "mechanical",
  "tests",
  "formatting",
])
export type AppendixKind = typeof AppendixKind.Type

export const PlacementTarget = Schema.Union([
  Schema.TaggedStruct("chapter", { chapterKey: ChapterKey }),
  Schema.TaggedStruct("appendix", { kind: AppendixKind }),
])
export type PlacementTarget = typeof PlacementTarget.Type

// One hunk, or a range of lines inside it, assigned to a chapter or to the
// appendix. Without a range the whole hunk is placed.
export const Placement = Schema.Struct({
  hunkId: HunkId,
  lines: Schema.NullOr(HunkLineRange),
  target: PlacementTarget,
})
export type Placement = typeof Placement.Type

export const MermaidDiagram = Schema.Struct({
  source: Schema.String,
  caption: Schema.String,
})
export type MermaidDiagram = typeof MermaidDiagram.Type

export const FlagKind = Schema.Literals([
  "risky-logic",
  "hidden-behaviour-change",
  "missing-tests",
  "contradicts-description",
])
export type FlagKind = typeof FlagKind.Type

export const Flag = Schema.Struct({
  hunkId: HunkId,
  // The line inside the hunk the flag points at, numbered like placements.
  line: Schema.Int,
  kind: FlagKind,
  note: Schema.String,
})
export type Flag = typeof Flag.Type

// A few lines of code a chapter shows to guide the reader's focus: the
// important, interesting or problematic parts. The rest of the chapter's code
// is on the Diff tab.
export const Excerpt = Schema.Struct({
  hunkId: HunkId,
  lines: HunkLineRange,
  // Why these lines are worth seeing, shown above them.
  why: Schema.String,
})
export type Excerpt = typeof Excerpt.Type

export const ChapterStatus = Schema.Literals(["waiting", "writing", "done", "failed"])
export type ChapterStatus = typeof ChapterStatus.Type

export const Chapter = Schema.Struct({
  key: ChapterKey,
  position: Schema.Int,
  title: Schema.String,
  // One line from the planner on what the chapter is about. The chapter run
  // writes the full explanation.
  purpose: Schema.String,
  status: ChapterStatus,
  body: Schema.NullOr(Schema.String),
  diagram: Schema.NullOr(MermaidDiagram),
  // In the order the writer chose them.
  excerpts: Schema.Array(Excerpt),
  flags: Schema.Array(Flag),
  failure: Schema.NullOr(Schema.String),
})
export type Chapter = typeof Chapter.Type

export const GuideStatus = Schema.Literals(["planning", "writing", "done", "failed"])
export type GuideStatus = typeof GuideStatus.Type

export const PullRequestRef = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  number: Schema.Int,
})
export type PullRequestRef = typeof PullRequestRef.Type

export const Guide = Schema.Struct({
  id: GuideId,
  pullRequest: PullRequestRef,
  title: Schema.String,
  headSha: Schema.String,
  mergeBaseSha: Schema.String,
  cli: AgentCli,
  status: GuideStatus,
  summary: Schema.NullOr(Schema.String),
  overviewDiagram: Schema.NullOr(MermaidDiagram),
  chapters: Schema.Array(Chapter),
  placements: Schema.Array(Placement),
  failure: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})
export type Guide = typeof Guide.Type

export const GuideSummary = Schema.Struct({
  id: GuideId,
  pullRequest: PullRequestRef,
  title: Schema.String,
  status: GuideStatus,
  createdAt: Schema.String,
})
export type GuideSummary = typeof GuideSummary.Type

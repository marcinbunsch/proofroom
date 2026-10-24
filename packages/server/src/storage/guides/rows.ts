import {
  AgentCli,
  ChapterKey,
  ChapterStatus,
  FlagKind,
  GuideId,
  GuideStatus,
  Hunk,
  HunkId,
  HunkLineRange,
  MermaidDiagram,
  PlacementTarget,
  type Chapter,
  type Excerpt,
  type Flag,
  type Guide,
  type GuideSummary,
} from "@proofroom/protocol"
import { Schema, Struct } from "effect"

// How a guide is laid out in SQLite: one schema per table, describing one row.
//
// Writes encode a domain value into a row with these schemas, and reads decode
// a row back with the same schemas, so the two directions can't drift apart.
// Nested values (a diagram, a placement's target) are stored as JSON text.

export const GuideRow = Schema.Struct({
  id: GuideId,
  owner: Schema.String,
  repo: Schema.String,
  number: Schema.Int,
  title: Schema.String,
  headSha: Schema.String,
  mergeBaseSha: Schema.String,
  cli: AgentCli,
  status: GuideStatus,
  summary: Schema.NullOr(Schema.String),
  overviewDiagram: Schema.NullOr(Schema.fromJsonString(MermaidDiagram)),
  failure: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  writerPid: Schema.NullOr(Schema.Int),
})
export type GuideRow = typeof GuideRow.Type

export const ChapterRow = Schema.Struct({
  key: ChapterKey,
  position: Schema.Int,
  title: Schema.String,
  purpose: Schema.String,
  status: ChapterStatus,
  body: Schema.NullOr(Schema.String),
  diagram: Schema.NullOr(Schema.fromJsonString(MermaidDiagram)),
  failure: Schema.NullOr(Schema.String),
})
export type ChapterRow = typeof ChapterRow.Type

export const PlacementRow = Schema.Struct({
  hunkId: HunkId,
  lines: Schema.NullOr(Schema.fromJsonString(HunkLineRange)),
  target: Schema.fromJsonString(PlacementTarget),
})
export type PlacementRow = typeof PlacementRow.Type

export const FlagRow = Schema.Struct({
  chapterKey: ChapterKey,
  hunkId: HunkId,
  line: Schema.Int,
  kind: FlagKind,
  note: Schema.String,
})
export type FlagRow = typeof FlagRow.Type

export const ExcerptRow = Schema.Struct({
  chapterKey: ChapterKey,
  hunkId: HunkId,
  lines: Schema.fromJsonString(HunkLineRange),
  why: Schema.String,
})
export type ExcerptRow = typeof ExcerptRow.Type

export const HunkRow = Schema.Struct({
  id: HunkId,
  // The hunk's place in the diff, so reads return hunks in diff order.
  position: Schema.Int,
  hunk: Schema.fromJsonString(Hunk),
})

// The columns the guide list needs, without the overview text and diagram.
export const GuideSummaryRow = GuideRow.mapFields(
  Struct.pick(["id", "owner", "repo", "number", "title", "status", "createdAt"]),
)
export type GuideSummaryRow = typeof GuideSummaryRow.Type

// --- rows to a guide ---------------------------------------------------------

export interface GuideRows {
  readonly guide: GuideRow
  readonly chapters: ReadonlyArray<ChapterRow>
  readonly placements: ReadonlyArray<PlacementRow>
  readonly excerpts: ReadonlyArray<ExcerptRow>
  readonly flags: ReadonlyArray<FlagRow>
}

export function toGuide(rows: GuideRows): Guide {
  const { guide } = rows
  return {
    id: guide.id,
    pullRequest: { owner: guide.owner, repo: guide.repo, number: guide.number },
    title: guide.title,
    headSha: guide.headSha,
    mergeBaseSha: guide.mergeBaseSha,
    cli: guide.cli,
    status: guide.status,
    summary: guide.summary,
    overviewDiagram: guide.overviewDiagram,
    failure: guide.failure,
    createdAt: guide.createdAt,
    chapters: rows.chapters.map((chapter) => toChapter(chapter, rows)),
    placements: rows.placements,
  }
}

function toChapter(chapter: ChapterRow, rows: GuideRows): Chapter {
  const excerpts: Array<Excerpt> = rows.excerpts
    .filter((excerpt) => excerpt.chapterKey === chapter.key)
    .map(({ hunkId, lines, why }) => ({ hunkId, lines, why }))
  const flags: Array<Flag> = rows.flags
    .filter((flag) => flag.chapterKey === chapter.key)
    .map(({ hunkId, line, kind, note }) => ({ hunkId, line, kind, note }))
  return { ...chapter, excerpts, flags }
}

export function toGuideSummary(row: GuideSummaryRow): GuideSummary {
  return {
    id: row.id,
    pullRequest: { owner: row.owner, repo: row.repo, number: row.number },
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
  }
}

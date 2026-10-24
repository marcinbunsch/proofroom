import { Schema } from "effect"

// A hunk is one `@@` section of the pull request's diff. Its id is derived from
// the file, the position and the content, so the same hunk keeps the same id
// across guide runs on the same commits.
export const HunkId = Schema.String.pipe(Schema.brand("HunkId"))
export type HunkId = typeof HunkId.Type

export const FileStatus = Schema.Literals(["added", "deleted", "modified", "renamed"])
export type FileStatus = typeof FileStatus.Type

export const HunkLineKind = Schema.Literals(["context", "addition", "deletion"])
export type HunkLineKind = typeof HunkLineKind.Type

export const HunkLine = Schema.Struct({
  kind: HunkLineKind,
  text: Schema.String,
  // Line numbers in the old and new file. A deletion has no new line number and
  // an addition has no old one.
  oldLineNumber: Schema.NullOr(Schema.Int),
  newLineNumber: Schema.NullOr(Schema.Int),
})
export type HunkLine = typeof HunkLine.Type

export const Hunk = Schema.Struct({
  id: HunkId,
  // The file's path after the change, or before it when the file was deleted.
  path: Schema.String,
  oldPath: Schema.NullOr(Schema.String),
  fileStatus: FileStatus,
  oldStart: Schema.Int,
  oldLineCount: Schema.Int,
  newStart: Schema.Int,
  newLineCount: Schema.Int,
  // The text git prints after the second `@@`, usually the enclosing function.
  sectionHeading: Schema.String,
  lines: Schema.Array(HunkLine),
})
export type Hunk = typeof Hunk.Type

// Lines inside a hunk are numbered from 1, counting every line of the hunk
// (context included), in the order git prints them. That is the numbering the
// agent sees, so it is the numbering placements and flags use.
export const HunkLineRange = Schema.Struct({
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  end: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
})
export type HunkLineRange = typeof HunkLineRange.Type

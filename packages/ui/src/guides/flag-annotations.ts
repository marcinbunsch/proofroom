import type { DiffLineAnnotation } from "@pierre/diffs"
import type { Flag, Hunk } from "@proofroom/protocol"

// Where a flag shows up in a diff. Flags count lines within their hunk; the
// diff view counts lines in the file, on the side the line exists on: a
// deleted line in the old file, any other line in the new one.

export type FlagAnnotation = DiffLineAnnotation<Flag>

export function flagAnnotations(
  hunks: ReadonlyArray<Hunk>,
  flags: ReadonlyArray<Flag>,
): Array<FlagAnnotation> {
  const hunksById = new Map(hunks.map((hunk) => [hunk.id, hunk]))
  return flags.flatMap((flag) => {
    const hunk = hunksById.get(flag.hunkId)
    return hunk === undefined ? [] : flagAnnotation(hunk, flag)
  })
}

function flagAnnotation(hunk: Hunk, flag: Flag): Array<FlagAnnotation> {
  const line = hunk.lines[flag.line - 1]
  if (line === undefined) return []
  if (line.kind === "deletion" && line.oldLineNumber !== null) {
    return [{ side: "deletions", lineNumber: line.oldLineNumber, metadata: flag }]
  }
  if (line.newLineNumber !== null) {
    return [{ side: "additions", lineNumber: line.newLineNumber, metadata: flag }]
  }
  return []
}

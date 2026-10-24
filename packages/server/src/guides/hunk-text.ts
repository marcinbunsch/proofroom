import type { Hunk, HunkLineRange } from "@proofroom/protocol"

// How hunks look to an agent. Lines are numbered from 1 within each hunk,
// context lines included, because that is the numbering placements and flags
// use.

// One line per hunk, for the planner's list of every hunk in the pull request.
export function hunkSummaryLine(hunk: Hunk): string {
  const additions = hunk.lines.filter((line) => line.kind === "addition").length
  const deletions = hunk.lines.filter((line) => line.kind === "deletion").length
  const renamedFrom = hunk.oldPath === null ? "" : ` (renamed from ${hunk.oldPath})`
  const heading = hunk.sectionHeading === "" ? "" : `  in: ${hunk.sectionHeading}`
  return `${hunk.id}  ${hunk.path}${renamedFrom}  ${hunk.fileStatus}  +${additions} -${deletions}  ${hunk.lines.length} lines${heading}`
}

// The whole hunk, every line numbered and marked as context, added or deleted.
// When only some of its lines belong to the reader's chapter, the note says
// which.
export function hunkText(hunk: Hunk, linesInChapter: HunkLineRange | null = null): string {
  const position = `@@ -${hunk.oldStart},${hunk.oldLineCount} +${hunk.newStart},${hunk.newLineCount} @@ ${hunk.sectionHeading}`
  const header = `### ${hunk.id}  ${hunk.path}  (${hunk.fileStatus})  ${position}`
  const note =
    linesInChapter === null
      ? []
      : [
          `(Only lines ${linesInChapter.start}-${linesInChapter.end} of this hunk belong to this chapter.)`,
        ]
  const numberWidth = String(hunk.lines.length).length
  const body = hunk.lines.map(
    (line, index) =>
      `${String(index + 1).padStart(numberWidth)} ${markers[line.kind]} ${line.text}`,
  )
  return [header, ...note, ...body].join("\n")
}

const markers = { context: " ", addition: "+", deletion: "-" } as const

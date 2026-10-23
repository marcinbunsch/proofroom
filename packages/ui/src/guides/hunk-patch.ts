import type { Hunk, HunkLine, HunkLineRange } from "@proofroom/protocol"

// The patch @pierre/diffs draws for a hunk in a chapter: a file header and one
// `@@` section. When only some of the hunk's lines belong to the chapter, the
// section holds just those lines, with a header that says where they sit in
// the old and new file.

const markers = { context: " ", addition: "+", deletion: "-" } as const

export function hunkPatch(hunk: Hunk, lines: HunkLineRange | null): string {
  const range = lines ?? { start: 1, end: hunk.lines.length }
  const linesBefore = hunk.lines.slice(0, range.start - 1)
  const linesShown = hunk.lines.slice(range.start - 1, range.end)

  const oldStart = hunk.oldStart + countOldSide(linesBefore)
  const newStart = hunk.newStart + countNewSide(linesBefore)
  const sectionHeader = `@@ -${oldStart},${countOldSide(linesShown)} +${newStart},${countNewSide(linesShown)} @@ ${hunk.sectionHeading}`

  return [
    ...fileHeader(hunk),
    sectionHeader.trimEnd(),
    ...linesShown.map((line) => `${markers[line.kind]}${line.text}`),
    "",
  ].join("\n")
}

function fileHeader(hunk: Hunk): Array<string> {
  const oldPath = hunk.oldPath ?? hunk.path
  return [
    `diff --git a/${oldPath} b/${hunk.path}`,
    hunk.fileStatus === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
    hunk.fileStatus === "deleted" ? "+++ /dev/null" : `+++ b/${hunk.path}`,
  ]
}

// Lines that exist in the old file (context and deletions) and in the new one
// (context and additions).
const countOldSide = (lines: ReadonlyArray<HunkLine>) =>
  lines.filter((line) => line.kind !== "addition").length
const countNewSide = (lines: ReadonlyArray<HunkLine>) =>
  lines.filter((line) => line.kind !== "deletion").length

import type { Hunk, HunkLine, HunkLineRange } from "@proofroom/protocol"

// The patches @pierre/diffs draws. A patch is a file header followed by `@@`
// sections:
//
// - a chapter shows one hunk, or just the lines of it placed in the chapter;
// - the Diff tab shows every hunk of a file, one section each.

const markers = { context: " ", addition: "+", deletion: "-" } as const

export function hunkPatch(hunk: Hunk, lines: HunkLineRange | null): string {
  return patchText(hunk, [section(hunk, lines)])
}

export function filePatch(hunks: readonly [Hunk, ...Array<Hunk>]): string {
  const [firstHunk] = hunks
  return patchText(
    firstHunk,
    hunks.map((hunk) => section(hunk, null)),
  )
}

function patchText(file: Hunk, sections: ReadonlyArray<ReadonlyArray<string>>): string {
  return [...fileHeader(file), ...sections.flat(), ""].join("\n")
}

function fileHeader(file: Hunk): Array<string> {
  const oldPath = file.oldPath ?? file.path
  return [
    `diff --git a/${oldPath} b/${file.path}`,
    file.fileStatus === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
    file.fileStatus === "deleted" ? "+++ /dev/null" : `+++ b/${file.path}`,
  ]
}

// One `@@` section. When only some of the hunk's lines are shown, the header
// says where those lines sit in the old and new file.
function section(hunk: Hunk, lines: HunkLineRange | null): Array<string> {
  const range = lines ?? { start: 1, end: hunk.lines.length }
  const linesBefore = hunk.lines.slice(0, range.start - 1)
  const linesShown = hunk.lines.slice(range.start - 1, range.end)

  const oldStart = hunk.oldStart + countOldSide(linesBefore)
  const newStart = hunk.newStart + countNewSide(linesBefore)
  const header = `@@ -${oldStart},${countOldSide(linesShown)} +${newStart},${countNewSide(linesShown)} @@ ${hunk.sectionHeading}`

  return [header.trimEnd(), ...linesShown.map((line) => `${markers[line.kind]}${line.text}`)]
}

// Lines that exist in the old file (context and deletions) and in the new one
// (context and additions).
const countOldSide = (lines: ReadonlyArray<HunkLine>) =>
  lines.filter((line) => line.kind !== "addition").length
const countNewSide = (lines: ReadonlyArray<HunkLine>) =>
  lines.filter((line) => line.kind !== "deletion").length

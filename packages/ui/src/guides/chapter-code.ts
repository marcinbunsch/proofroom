import type { Chapter, Flag, Hunk, HunkId, Placement } from "@proofroom/protocol"

// What a chapter says about its code beyond the excerpts it shows: how much
// code it covers, and the flags that sit outside its excerpts.

export interface ChapterCode {
  readonly fileCount: number
  readonly changedLineCount: number
  // Where "Open in Diff" takes the reader: the chapter's first file.
  readonly firstPath: string | null
}

export function chapterCode(
  placements: ReadonlyArray<Placement>,
  hunksById: ReadonlyMap<HunkId, Hunk>,
): ChapterCode {
  const paths = new Set<string>()
  let changedLineCount = 0
  for (const placement of placements) {
    const hunk = hunksById.get(placement.hunkId)
    if (hunk === undefined) continue
    paths.add(hunk.path)
    const range = placement.lines ?? { start: 1, end: hunk.lines.length }
    const placedLines = hunk.lines.slice(range.start - 1, range.end)
    changedLineCount += placedLines.filter((line) => line.kind !== "context").length
  }
  return { fileCount: paths.size, changedLineCount, firstPath: paths.values().next().value ?? null }
}

// A flag whose line no excerpt shows. The chapter lists these, so no flag is
// hidden just because the writer didn't show its lines.
export function flagsOutsideExcerpts(chapter: Chapter): Array<Flag> {
  return chapter.flags.filter(
    (flag) =>
      !chapter.excerpts.some(
        (excerpt) =>
          excerpt.hunkId === flag.hunkId &&
          excerpt.lines.start <= flag.line &&
          flag.line <= excerpt.lines.end,
      ),
  )
}

// "src/cart/total.ts:6", for a flag listed outside the excerpts.
export function flagLocation(flag: Flag, hunksById: ReadonlyMap<HunkId, Hunk>): string {
  const hunk = hunksById.get(flag.hunkId)
  const line = hunk?.lines[flag.line - 1]
  if (hunk === undefined || line === undefined) return "the Diff tab"
  const lineNumber = line.kind === "deletion" ? line.oldLineNumber : line.newLineNumber
  return lineNumber === null ? hunk.path : `${hunk.path}:${lineNumber}`
}

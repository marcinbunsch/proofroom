import type { Hunk, HunkId, HunkLineRange, Placement } from "@proofroom/protocol"

// The rule that lets the reader trust the guide's silence: every changed line
// of the pull request is placed exactly once, in a chapter or in the appendix.
// The app checks this itself; the agent's word is not taken for it.
//
// Only additions and deletions have to be placed. Context lines are there for
// reading: a placement may cover them freely, and covering one twice is fine.

export type CoverageProblem =
  | { readonly _tag: "UnknownHunk"; readonly hunkId: HunkId }
  | {
      readonly _tag: "RangeOutOfBounds"
      readonly hunkId: HunkId
      readonly range: HunkLineRange
      readonly lineCount: number
    }
  | {
      readonly _tag: "Unplaced"
      readonly hunkId: HunkId
      readonly path: string
      readonly ranges: ReadonlyArray<HunkLineRange>
    }
  | {
      readonly _tag: "PlacedTwice"
      readonly hunkId: HunkId
      readonly path: string
      readonly ranges: ReadonlyArray<HunkLineRange>
    }

type PlacedLines = Pick<Placement, "hunkId" | "lines">

export function checkCoverage(
  hunks: ReadonlyArray<Hunk>,
  placements: ReadonlyArray<PlacedLines>,
): Array<CoverageProblem> {
  const knownHunkIds = new Set(hunks.map((hunk) => hunk.id))
  const placementsOfUnknownHunks = placements.filter(
    (placement) => !knownHunkIds.has(placement.hunkId),
  )
  const placementsOf = (hunk: Hunk) =>
    placements.filter((placement) => placement.hunkId === hunk.id)
  return [
    ...placementsOfUnknownHunks.map((placement) => ({
      _tag: "UnknownHunk" as const,
      hunkId: placement.hunkId,
    })),
    ...hunks.flatMap((hunk) => checkHunk(hunk, placementsOf(hunk))),
  ]
}

function checkHunk(hunk: Hunk, placements: ReadonlyArray<PlacedLines>): Array<CoverageProblem> {
  const ranges = placements.map((placement) => placement.lines ?? wholeHunk(hunk))
  const rangesOutOfBounds = ranges.filter((range) => !isInsideHunk(range, hunk))
  const rangesInBounds = ranges.filter((range) => isInsideHunk(range, hunk))

  const changedLines = describeChangedLines(hunk, rangesInBounds)
  const unplaced = groupIntoRanges(changedLines, (line) => line.timesPlaced === 0)
  const placedTwice = groupIntoRanges(changedLines, (line) => line.timesPlaced > 1)

  const problems: Array<CoverageProblem> = rangesOutOfBounds.map((range) => ({
    _tag: "RangeOutOfBounds",
    hunkId: hunk.id,
    range,
    lineCount: hunk.lines.length,
  }))
  if (unplaced.length > 0) {
    problems.push({ _tag: "Unplaced", hunkId: hunk.id, path: hunk.path, ranges: unplaced })
  }
  if (placedTwice.length > 0) {
    problems.push({ _tag: "PlacedTwice", hunkId: hunk.id, path: hunk.path, ranges: placedTwice })
  }
  return problems
}

interface ChangedLine {
  // Numbered from 1 within the hunk, context lines included.
  readonly lineNumber: number
  readonly timesPlaced: number
}

function describeChangedLines(
  hunk: Hunk,
  ranges: ReadonlyArray<HunkLineRange>,
): Array<ChangedLine> {
  return hunk.lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.kind !== "context")
    .map(({ lineNumber }) => ({
      lineNumber,
      timesPlaced: countRangesContaining(ranges, lineNumber),
    }))
}

function countRangesContaining(ranges: ReadonlyArray<HunkLineRange>, lineNumber: number): number {
  return ranges.filter((range) => range.start <= lineNumber && lineNumber <= range.end).length
}

// Groups the changed lines that match into ranges, so the agent reads
// "lines 4-9" instead of six separate complaints. A changed line that doesn't
// match ends a range; context lines in between don't.
function groupIntoRanges(
  changedLines: ReadonlyArray<ChangedLine>,
  matches: (line: ChangedLine) => boolean,
): Array<HunkLineRange> {
  const ranges: Array<{ start: number; end: number }> = []
  let openRange: { start: number; end: number } | null = null
  for (const line of changedLines) {
    if (!matches(line)) {
      openRange = null
      continue
    }
    if (openRange === null) {
      openRange = { start: line.lineNumber, end: line.lineNumber }
      ranges.push(openRange)
    } else {
      openRange.end = line.lineNumber
    }
  }
  return ranges
}

const wholeHunk = (hunk: Hunk): HunkLineRange => ({ start: 1, end: hunk.lines.length })

const isInsideHunk = (range: HunkLineRange, hunk: Hunk) =>
  range.start <= range.end && range.end <= hunk.lines.length

export function describeCoverageProblem(problem: CoverageProblem): string {
  switch (problem._tag) {
    case "UnknownHunk":
      return `${problem.hunkId} is not a hunk of this pull request.`
    case "RangeOutOfBounds":
      return `${problem.hunkId} has ${problem.lineCount} lines; lines ${problem.range.start}-${problem.range.end} is out of range.`
    case "Unplaced":
      return `${problem.hunkId} (${problem.path}) lines ${formatRanges(problem.ranges)} are not placed anywhere.`
    case "PlacedTwice":
      return `${problem.hunkId} (${problem.path}) lines ${formatRanges(problem.ranges)} are placed more than once.`
  }
}

function formatRanges(ranges: ReadonlyArray<HunkLineRange>): string {
  return ranges
    .map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`))
    .join(", ")
}

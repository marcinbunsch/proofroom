import { describe, expect, it } from "@effect/vitest"
import { HunkId } from "@proofroom/protocol"
import { checkCoverage, describeCoverageProblem } from "../src/guides/coverage.ts"
import { parseUnifiedDiff } from "../src/pull-requests/parse-diff.ts"
import { checkoutDiff } from "./fixtures/checkout-diff.ts"

describe("checkCoverage", () => {
  const hunks = parseUnifiedDiff(checkoutDiff)
  const [discountHunk, thresholdHunk, ...otherHunks] = hunks
  const placeWhole = (hunk: (typeof hunks)[number]) => ({ hunkId: hunk.id, lines: null })

  it("every hunk placed whole -> no problems", () => {
    expect(checkCoverage(hunks, hunks.map(placeWhole))).toEqual([])
  })

  it("hunk split into two ranges that cover all changed lines -> no problems", () => {
    // Lines 3-4 are the signature change, 7-9 the rounding change.
    const split = [
      { hunkId: discountHunk!.id, lines: { start: 1, end: 4 } },
      { hunkId: discountHunk!.id, lines: { start: 5, end: discountHunk!.lines.length } },
    ]
    expect(
      checkCoverage(hunks, [...split, ...[thresholdHunk!, ...otherHunks].map(placeWhole)]),
    ).toEqual([])
  })

  it("hunk left out -> its changed lines reported, context lines ignored", () => {
    const problems = checkCoverage(hunks, [discountHunk!, ...otherHunks].map(placeWhole))
    expect(problems).toEqual([
      {
        _tag: "Unplaced",
        hunkId: thresholdHunk!.id,
        path: "src/cart/total.ts",
        ranges: [{ start: 3, end: 3 }],
      },
    ])
    expect(describeCoverageProblem(problems[0]!)).toBe(
      `${thresholdHunk!.id} (src/cart/total.ts) lines 3 are not placed anywhere.`,
    )
  })

  it("overlapping ranges -> the overlapping changed line reported as placed twice", () => {
    // Line 7 is the deleted `return sum`; both ranges claim it.
    const overlapping = [
      { hunkId: discountHunk!.id, lines: { start: 1, end: 7 } },
      { hunkId: discountHunk!.id, lines: { start: 7, end: discountHunk!.lines.length } },
    ]
    const problems = checkCoverage(hunks, [
      ...overlapping,
      ...[thresholdHunk!, ...otherHunks].map(placeWhole),
    ])
    expect(problems).toEqual([
      {
        _tag: "PlacedTwice",
        hunkId: discountHunk!.id,
        path: "src/cart/total.ts",
        ranges: [{ start: 7, end: 7 }],
      },
    ])
  })

  it("overlap on a context line only -> not a problem", () => {
    // Line 6 is the unchanged `for` loop.
    const overlapping = [
      { hunkId: discountHunk!.id, lines: { start: 1, end: 6 } },
      { hunkId: discountHunk!.id, lines: { start: 6, end: discountHunk!.lines.length } },
    ]
    expect(checkCoverage([discountHunk!], overlapping)).toEqual([])
  })

  it("unplaced lines after placed ones -> reported as one range", () => {
    // Lines 3-4 are changed, 5-6 context, 7-9 changed again.
    const problems = checkCoverage(
      [discountHunk!],
      [{ hunkId: discountHunk!.id, lines: { start: 1, end: 4 } }],
    )
    expect(problems).toEqual([
      {
        _tag: "Unplaced",
        hunkId: discountHunk!.id,
        path: "src/cart/total.ts",
        ranges: [{ start: 7, end: 9 }],
      },
    ])
  })

  it("context lines between unplaced changed lines -> one range, not two", () => {
    const problems = checkCoverage([discountHunk!], [])
    expect(problems).toEqual([
      {
        _tag: "Unplaced",
        hunkId: discountHunk!.id,
        path: "src/cart/total.ts",
        ranges: [{ start: 3, end: 9 }],
      },
    ])
  })

  it("unknown hunk id and out-of-range lines -> both reported", () => {
    const problems = checkCoverage(hunks, [
      ...hunks.map(placeWhole),
      { hunkId: HunkId.make("h0000000000"), lines: null },
      { hunkId: discountHunk!.id, lines: { start: 2, end: 40 } },
    ])
    expect(problems.map((problem) => problem._tag)).toEqual(["UnknownHunk", "RangeOutOfBounds"])
  })
})

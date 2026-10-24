import { ChapterKey, HunkId, type Chapter, type Flag, type Hunk } from "@proofroom/protocol"
import { describe, expect, it } from "vitest"
import { chapterCode, flagLocation, flagsOutsideExcerpts } from "../src/guides/chapter-code.ts"

// total.ts: line 1 unchanged, 2 deleted (old 2), 3-4 added (new 2-3).
const totalHunk: Hunk = {
  id: HunkId.make("h3fa9c01b2e"),
  path: "src/cart/total.ts",
  oldPath: null,
  fileStatus: "modified",
  oldStart: 1,
  oldLineCount: 2,
  newStart: 1,
  newLineCount: 3,
  sectionHeading: "",
  lines: [
    {
      kind: "context",
      text: "export function cartTotal(prices: number[], discountPercent = 0): number {",
      oldLineNumber: 1,
      newLineNumber: 1,
    },
    {
      kind: "deletion",
      text: "  return prices.reduce((sum, price) => sum + price, 0)",
      oldLineNumber: 2,
      newLineNumber: null,
    },
    {
      kind: "addition",
      text: "  const sum = prices.reduce((total, price) => total + price, 0)",
      oldLineNumber: null,
      newLineNumber: 2,
    },
    {
      kind: "addition",
      text: "  return Math.round(sum * (1 - discountPercent / 100))",
      oldLineNumber: null,
      newLineNumber: 3,
    },
  ],
}
const couponHunk: Hunk = {
  ...totalHunk,
  id: HunkId.make("h77b20c4e19"),
  path: "src/cart/coupons.ts",
  fileStatus: "added",
  lines: [
    {
      kind: "addition",
      text: 'export const WELCOME_COUPON = "WELCOME10"',
      oldLineNumber: null,
      newLineNumber: 1,
    },
  ],
}
const hunksById = new Map([totalHunk, couponHunk].map((hunk) => [hunk.id, hunk]))

const roundingFlag: Flag = {
  hunkId: totalHunk.id,
  line: 4,
  kind: "risky-logic",
  note: "Rounding moved.",
}
const removedFlag: Flag = {
  hunkId: totalHunk.id,
  line: 2,
  kind: "hidden-behaviour-change",
  note: "Old sum gone.",
}

const discountsChapter: Chapter = {
  key: ChapterKey.make("discounts"),
  position: 0,
  title: "Discounts",
  purpose: "cartTotal takes a percentage",
  status: "done",
  body: "The total is rounded after the discount.",
  visuals: [],
  excerpts: [{ hunkId: totalHunk.id, lines: { start: 3, end: 4 }, why: "The rounding." }],
  flags: [roundingFlag, removedFlag],
  failure: null,
}

describe("chapterCode", () => {
  it("whole hunk and part of another file -> files counted once, only changed lines counted", () => {
    const code = chapterCode(
      [
        {
          hunkId: totalHunk.id,
          lines: { start: 1, end: 3 },
          target: { _tag: "chapter", chapterKey: discountsChapter.key },
        },
        {
          hunkId: couponHunk.id,
          lines: null,
          target: { _tag: "chapter", chapterKey: discountsChapter.key },
        },
      ],
      hunksById,
    )
    expect(code).toEqual({ fileCount: 2, changedLineCount: 3, firstPath: "src/cart/total.ts" })
  })

  it("no placements -> nothing to open", () => {
    expect(chapterCode([], hunksById)).toEqual({
      fileCount: 0,
      changedLineCount: 0,
      firstPath: null,
    })
  })
})

describe("flagsOutsideExcerpts", () => {
  it("one flag inside an excerpt, one outside -> only the outside one", () => {
    expect(flagsOutsideExcerpts(discountsChapter)).toEqual([removedFlag])
  })
})

describe("flagLocation", () => {
  it("flag on a deleted line -> its old line number; on an added line -> its new one", () => {
    expect(flagLocation(removedFlag, hunksById)).toBe("src/cart/total.ts:2")
    expect(flagLocation(roundingFlag, hunksById)).toBe("src/cart/total.ts:3")
  })
})

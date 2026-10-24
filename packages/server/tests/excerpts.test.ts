import { describe, expect, it } from "@effect/vitest"
import { HunkId, type Hunk, type HunkLine } from "@proofroom/protocol"
import { excerptProblem } from "../src/guides/chapters/chapter-tools.ts"

// A 20-line hunk: a new pricing module, unchanged lines 1-4, added lines 5-20.
const unchangedLine = (number: number): HunkLine => ({
  kind: "context",
  text: `// pricing rule ${number}`,
  oldLineNumber: number,
  newLineNumber: number,
})
const addedLine = (number: number): HunkLine => ({
  kind: "addition",
  text: `export const tier${number} = ${number * 100}`,
  oldLineNumber: null,
  newLineNumber: number,
})
const pricingHunk: Hunk = {
  id: HunkId.make("h5e8a1c03bd"),
  path: "src/pricing/tiers.ts",
  oldPath: null,
  fileStatus: "modified",
  oldStart: 1,
  oldLineCount: 4,
  newStart: 1,
  newLineCount: 20,
  sectionHeading: "",
  lines: [1, 2, 3, 4]
    .map(unchangedLine)
    .concat(Array.from({ length: 16 }, (_, index) => addedLine(index + 5))),
}

describe("excerptProblem", () => {
  it("a few lines with a change in them -> accepted", () => {
    expect(excerptProblem(pricingHunk, { start: 4, end: 8 })).toBeNull()
  })

  it("15 lines -> accepted; 16 -> too long", () => {
    expect(excerptProblem(pricingHunk, { start: 5, end: 19 })).toBeNull()
    expect(excerptProblem(pricingHunk, { start: 5, end: 20 })).toContain("at most 15 lines")
  })

  it("only unchanged lines -> refused", () => {
    expect(excerptProblem(pricingHunk, { start: 1, end: 4 })).toContain(
      "don't include a changed line",
    )
  })

  it("past the end of the hunk, or backwards -> out of range", () => {
    expect(excerptProblem(pricingHunk, { start: 18, end: 21 })).toContain("out of range")
    expect(excerptProblem(pricingHunk, { start: 8, end: 6 })).toContain("out of range")
  })
})

import { HunkId, type Hunk } from "@proofroom/protocol"
import { describe, expect, it } from "vitest"
import { hunkPatch } from "../src/guides/hunk-patch.ts"

// cartTotal gains a discount: the signature changes on line 3, the return on
// lines 7-9.
const discountHunk: Hunk = {
  id: HunkId.make("h3fa9c01b2e"),
  path: "src/cart/total.ts",
  oldPath: null,
  fileStatus: "modified",
  oldStart: 1,
  oldLineCount: 6,
  newStart: 1,
  newLineCount: 7,
  sectionHeading: "",
  lines: [
    {
      kind: "context",
      text: 'import type { LineItem } from "./line-item.ts"',
      oldLineNumber: 1,
      newLineNumber: 1,
    },
    { kind: "context", text: "", oldLineNumber: 2, newLineNumber: 2 },
    {
      kind: "deletion",
      text: "export function cartTotal(items: LineItem[]): number {",
      oldLineNumber: 3,
      newLineNumber: null,
    },
    {
      kind: "addition",
      text: "export function cartTotal(items: LineItem[], discountPercent = 0): number {",
      oldLineNumber: null,
      newLineNumber: 3,
    },
    { kind: "context", text: "  let sum = 0", oldLineNumber: 4, newLineNumber: 4 },
    {
      kind: "context",
      text: "  for (const item of items) sum += item.priceCents",
      oldLineNumber: 5,
      newLineNumber: 5,
    },
    { kind: "deletion", text: "  return sum", oldLineNumber: 6, newLineNumber: null },
    {
      kind: "addition",
      text: "  const discounted = sum * (1 - discountPercent / 100)",
      oldLineNumber: null,
      newLineNumber: 6,
    },
    {
      kind: "addition",
      text: "  return Math.round(discounted)",
      oldLineNumber: null,
      newLineNumber: 7,
    },
  ],
}

describe("hunkPatch", () => {
  it("whole hunk -> the hunk's own header and every line", () => {
    const patch = hunkPatch(discountHunk, null)
    expect(patch.split("\n").slice(0, 4)).toEqual([
      "diff --git a/src/cart/total.ts b/src/cart/total.ts",
      "--- a/src/cart/total.ts",
      "+++ b/src/cart/total.ts",
      "@@ -1,6 +1,7 @@",
    ])
    expect(patch.split("\n")).toHaveLength(4 + 9 + 1)
  })

  it("lines 5-9 only -> a header that starts at old line 4 and new line 4", () => {
    const patch = hunkPatch(discountHunk, { start: 5, end: 9 })
    expect(patch.split("\n").slice(3)).toEqual([
      "@@ -4,3 +4,4 @@",
      "   let sum = 0",
      "   for (const item of items) sum += item.priceCents",
      "-  return sum",
      "+  const discounted = sum * (1 - discountPercent / 100)",
      "+  return Math.round(discounted)",
      "",
    ])
  })

  it("added file -> /dev/null as the old side", () => {
    const patch = hunkPatch({ ...discountHunk, fileStatus: "added" }, null)
    expect(patch.split("\n")[1]).toBe("--- /dev/null")
  })
})

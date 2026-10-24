import { HunkId, type Hunk } from "@proofroom/protocol"
import { describe, expect, it } from "vitest"
import { groupHunksByFile } from "../src/guides/diff-files.ts"
import { filePatch, hunkPatch } from "../src/guides/hunk-patch.ts"

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

// A second change further down total.ts, and a hunk in another file.
const thresholdHunk: Hunk = {
  ...discountHunk,
  id: HunkId.make("h7c2e91d04a"),
  oldStart: 20,
  oldLineCount: 1,
  newStart: 21,
  newLineCount: 2,
  sectionHeading: "export function formatTotal(cents: number): string {",
  lines: [
    { kind: "context", text: "}", oldLineNumber: 20, newLineNumber: 21 },
    {
      kind: "addition",
      text: "export const FREE_SHIPPING_THRESHOLD_CENTS = 50_00",
      oldLineNumber: null,
      newLineNumber: 22,
    },
  ],
}
const couponHunk: Hunk = {
  ...discountHunk,
  id: HunkId.make("h77b20c4e19"),
  path: "src/cart/coupons.ts",
  fileStatus: "added",
  oldStart: 0,
  oldLineCount: 0,
  newStart: 1,
  newLineCount: 1,
  lines: [
    {
      kind: "addition",
      text: 'export const WELCOME_COUPON = "WELCOME10"',
      oldLineNumber: null,
      newLineNumber: 1,
    },
  ],
}

describe("filePatch", () => {
  it("two hunks of one file -> one file header, then each hunk's section", () => {
    const sectionHeaders = filePatch([discountHunk, thresholdHunk])
      .split("\n")
      .filter((line) => line.startsWith("diff --git") || line.startsWith("@@"))
    expect(sectionHeaders).toEqual([
      "diff --git a/src/cart/total.ts b/src/cart/total.ts",
      "@@ -1,6 +1,7 @@",
      "@@ -20,1 +21,2 @@ export function formatTotal(cents: number): string {",
    ])
  })
})

describe("groupHunksByFile", () => {
  it("hunks in diff order -> one entry per file, hunks kept in order", () => {
    const files = groupHunksByFile([discountHunk, thresholdHunk, couponHunk])
    expect(files.map((file) => [file.path, file.hunks.map((hunk) => hunk.id)])).toEqual([
      ["src/cart/total.ts", ["h3fa9c01b2e", "h7c2e91d04a"]],
      ["src/cart/coupons.ts", ["h77b20c4e19"]],
    ])
  })
})

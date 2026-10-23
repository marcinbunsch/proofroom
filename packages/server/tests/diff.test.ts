import { describe, expect, it } from "@effect/vitest"
import { HunkId } from "@proofroom/protocol"
import { checkCoverage, describeCoverageProblem } from "../src/diff/coverage.ts"
import { parseUnifiedDiff } from "../src/diff/parse-diff.ts"

// Written the way Proofroom's own `git diff` call prints it: a/ b/ prefixes,
// rename detection, three lines of context.
const checkoutDiff = `diff --git a/src/cart/total.ts b/src/cart/total.ts
index 3f1c2aa..8b0d9e1 100644
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -1,6 +1,7 @@
 import type { LineItem } from "./line-item.ts"
 
-export function cartTotal(items: LineItem[]): number {
+export function cartTotal(items: LineItem[], discountPercent = 0): number {
   let sum = 0
   for (const item of items) sum += item.priceCents * item.quantity
-  return sum
+  const discounted = sum * (1 - discountPercent / 100)
+  return Math.round(discounted)
 }
@@ -20,3 +21,4 @@ export function formatTotal(cents: number): string {
   return (cents / 100).toFixed(2)
 }
+export const FREE_SHIPPING_THRESHOLD_CENTS = 50_00
diff --git a/src/cart/coupons.ts b/src/cart/coupons.ts
new file mode 100644
index 0000000..c4a71f0
--- /dev/null
+++ b/src/cart/coupons.ts
@@ -0,0 +1,2 @@
+export const WELCOME_COUPON = "WELCOME10"
+export const WELCOME_DISCOUNT_PERCENT = 10
diff --git a/src/legacy/price.ts b/src/legacy/price.ts
deleted file mode 100644
index 77aa001..0000000
--- a/src/legacy/price.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const legacyPrice = (cents: number) => cents / 100
diff --git a/src/checkout/summary.ts b/src/checkout/order-summary.ts
similarity index 91%
rename from src/checkout/summary.ts
rename to src/checkout/order-summary.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/checkout/summary.ts
+++ b/src/checkout/order-summary.ts
@@ -2,2 +2,2 @@ import { cartTotal } from "../cart/total.ts"
-export const summaryTitle = "Summary"
+export const summaryTitle = "Order summary"
 export const showTaxes = true
diff --git a/docs/checkout flow.md b/docs/checkout flow.md
index 0a1b2c3..4d5e6f7 100644
--- a/docs/checkout flow.md
+++ b/docs/checkout flow.md
@@ -1 +1 @@
-Checkout has three steps.
+Checkout has four steps.
\\ No newline at end of file
`

describe("parseUnifiedDiff", () => {
  const hunks = parseUnifiedDiff(checkoutDiff)

  it("modified file with two hunks -> two hunks with their own positions", () => {
    const totalHunks = hunks.filter((hunk) => hunk.path === "src/cart/total.ts")
    expect(
      totalHunks.map((hunk) => [
        hunk.oldStart,
        hunk.oldLineCount,
        hunk.newStart,
        hunk.newLineCount,
      ]),
    ).toEqual([
      [1, 6, 1, 7],
      [20, 3, 21, 4],
    ])
    expect(totalHunks[1]!.sectionHeading).toBe(
      "export function formatTotal(cents: number): string {",
    )
    expect(totalHunks.every((hunk) => hunk.fileStatus === "modified")).toBe(true)
  })

  it("lines -> numbered on both sides, deletions without a new number", () => {
    const firstHunk = hunks[0]!
    expect(firstHunk.lines.slice(0, 4)).toEqual([
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
    ])
  })

  it("added, deleted and renamed files -> statuses and paths from both sides", () => {
    const byPath = new Map(hunks.map((hunk) => [hunk.path, hunk]))
    expect(byPath.get("src/cart/coupons.ts")?.fileStatus).toBe("added")
    expect(byPath.get("src/legacy/price.ts")?.fileStatus).toBe("deleted")
    expect(byPath.get("src/checkout/order-summary.ts")).toMatchObject({
      fileStatus: "renamed",
      oldPath: "src/checkout/summary.ts",
    })
  })

  it("path with a space, no newline at end of file -> path kept, marker not a line", () => {
    const docsHunk = hunks.find((hunk) => hunk.path === "docs/checkout flow.md")!
    expect(docsHunk.lines.map((line) => line.kind)).toEqual(["deletion", "addition"])
  })

  it("same hunk in a different diff -> same id", () => {
    const onlyCoupons = checkoutDiff.slice(checkoutDiff.indexOf("diff --git a/src/cart/coupons.ts"))
    const couponsId = (parsed: ReturnType<typeof parseUnifiedDiff>) =>
      parsed.find((hunk) => hunk.path === "src/cart/coupons.ts")!.id
    expect(couponsId(parseUnifiedDiff(onlyCoupons))).toBe(couponsId(hunks))
  })

  it("every hunk -> a distinct short id", () => {
    const ids = hunks.map((hunk) => hunk.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^h[0-9a-f]{10}$/.test(id))).toBe(true)
  })
})

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

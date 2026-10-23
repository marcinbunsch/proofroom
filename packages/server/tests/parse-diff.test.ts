import { describe, expect, it } from "@effect/vitest"
import { parseUnifiedDiff } from "../src/pull-requests/parse-diff.ts"
import { checkoutDiff } from "./fixtures/checkout-diff.ts"

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

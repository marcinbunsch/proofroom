import {
  DraftCommentId,
  GuideId,
  HunkId,
  type DraftComment,
  type Flag,
  type Hunk,
} from "@proofroom/protocol"
import { describe, expect, it } from "vitest"
import {
  anchorForSelection,
  composerNotes,
  draftNotes,
  flagNotes,
} from "../src/guides/code-notes.ts"

// cartTotal's return changes: line 2 of the hunk is the deleted `return sum`
// (old line 6), line 3 the added rounded return (new line 6).
const returnHunk: Hunk = {
  id: HunkId.make("h3fa9c01b2e"),
  path: "src/cart/total.ts",
  oldPath: null,
  fileStatus: "modified",
  oldStart: 5,
  oldLineCount: 2,
  newStart: 5,
  newLineCount: 2,
  sectionHeading: "",
  lines: [
    {
      kind: "context",
      text: "  for (const item of items) sum += item.priceCents",
      oldLineNumber: 5,
      newLineNumber: 5,
    },
    { kind: "deletion", text: "  return sum", oldLineNumber: 6, newLineNumber: null },
    {
      kind: "addition",
      text: "  return Math.round(sum * (1 - discountPercent / 100))",
      oldLineNumber: null,
      newLineNumber: 6,
    },
  ],
}

const flagOn = (line: number): Flag => ({
  hunkId: returnHunk.id,
  line,
  kind: "hidden-behaviour-change",
  note: "Totals are rounded now.",
})

const guideId = GuideId.make("0b5a8f2e-6c1d-4e7a-9f3b-2d8c4a6e1f90")

const draftOn = (path: string, side: "old" | "new", line: number): DraftComment => ({
  id: DraftCommentId.make(`draft-${path}-${side}-${line}`),
  guideId,
  anchor: { path, side, line },
  body: "Round after the discount?",
  createdAt: "2026-10-24T09:00:00.000Z",
})

describe("flagNotes", () => {
  it("flag on a deleted line -> under that line in the old file", () => {
    expect(
      flagNotes([returnHunk], [flagOn(2)]).map(({ side, lineNumber }) => [side, lineNumber]),
    ).toEqual([["deletions", 6]])
  })

  it("flag on an added line -> under that line in the new file", () => {
    expect(
      flagNotes([returnHunk], [flagOn(3)]).map(({ side, lineNumber }) => [side, lineNumber]),
    ).toEqual([["additions", 6]])
  })

  it("flag outside the hunks shown -> no note", () => {
    expect(flagNotes([], [flagOn(3)])).toEqual([])
  })
})

describe("draftNotes", () => {
  it("drafts on several files -> only this file's, on their own side", () => {
    const notes = draftNotes("src/cart/total.ts", [
      draftOn("src/cart/total.ts", "old", 6),
      draftOn("src/cart/coupons.ts", "new", 1),
    ])
    expect(notes.map(({ side, lineNumber }) => [side, lineNumber])).toEqual([["deletions", 6]])
  })
})

describe("composerNotes", () => {
  it("box open on this file -> one note there; on another file or closed -> none", () => {
    const anchor = { path: "src/cart/total.ts", side: "new", line: 6 } as const
    expect(
      composerNotes("src/cart/total.ts", anchor).map(({ side, lineNumber }) => [side, lineNumber]),
    ).toEqual([["additions", 6]])
    expect(composerNotes("src/cart/coupons.ts", anchor)).toEqual([])
    expect(composerNotes("src/cart/total.ts", null)).toEqual([])
  })
})

describe("anchorForSelection", () => {
  it("lines picked across both sides -> the comment goes on the last one", () => {
    expect(
      anchorForSelection("src/cart/total.ts", {
        start: 6,
        side: "deletions",
        end: 6,
        endSide: "additions",
      }),
    ).toEqual({ path: "src/cart/total.ts", side: "new", line: 6 })
  })

  it("a deleted line -> the old side", () => {
    expect(
      anchorForSelection("src/cart/total.ts", { start: 6, end: 6, side: "deletions" }),
    ).toEqual({
      path: "src/cart/total.ts",
      side: "old",
      line: 6,
    })
  })
})

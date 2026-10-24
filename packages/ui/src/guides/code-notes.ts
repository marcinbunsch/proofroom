import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs"
import type { CommentAnchor, DraftComment, Flag, Hunk } from "@proofroom/protocol"

// The notes shown under lines of code: the guide's flags, the reader's draft
// comments, and the box a new comment is being written in.
//
// Each sits on a line of a file, on the side the line exists on. The diff view
// calls the sides "deletions" (the old file) and "additions" (the new one);
// Proofroom calls them "old" and "new".

export type CodeNote =
  | { readonly _tag: "flag"; readonly flag: Flag }
  | { readonly _tag: "draft"; readonly draft: DraftComment }
  | { readonly _tag: "composer"; readonly anchor: CommentAnchor }

export type CodeNoteAnnotation = DiffLineAnnotation<CodeNote>

type DiffSide = CodeNoteAnnotation["side"]

// Flags count lines within their hunk, so each is first found in its hunk:
// a deleted line sits in the old file, any other line in the new one.
export function flagNotes(
  hunks: ReadonlyArray<Hunk>,
  flags: ReadonlyArray<Flag>,
): Array<CodeNoteAnnotation> {
  const hunksById = new Map(hunks.map((hunk) => [hunk.id, hunk]))
  return flags.flatMap((flag) => {
    const line = hunksById.get(flag.hunkId)?.lines[flag.line - 1]
    if (line === undefined) return []
    const isOldLine = line.kind === "deletion"
    const lineNumber = isOldLine ? line.oldLineNumber : line.newLineNumber
    if (lineNumber === null) return []
    const side: DiffSide = isOldLine ? "deletions" : "additions"
    return [{ side, lineNumber, metadata: { _tag: "flag", flag } }]
  })
}

export function draftNotes(
  path: string,
  drafts: ReadonlyArray<DraftComment>,
): Array<CodeNoteAnnotation> {
  return drafts
    .filter((draft) => draft.anchor.path === path)
    .map((draft) => ({
      side: toDiffSide(draft.anchor.side),
      lineNumber: draft.anchor.line,
      metadata: { _tag: "draft", draft },
    }))
}

export function composerNotes(
  path: string,
  anchor: CommentAnchor | null,
): Array<CodeNoteAnnotation> {
  if (anchor === null || anchor.path !== path) return []
  return [
    {
      side: toDiffSide(anchor.side),
      lineNumber: anchor.line,
      metadata: { _tag: "composer", anchor },
    },
  ]
}

// Where a new comment goes when the reader presses the comment button: on the
// last line of the lines they picked. (GitHub can take comments spanning
// several lines; Proofroom sticks to one for now.)
export function anchorForSelection(path: string, selection: SelectedLineRange): CommentAnchor {
  const side = selection.endSide ?? selection.side ?? "additions"
  return { path, side: side === "deletions" ? "old" : "new", line: selection.end }
}

// What the diff should show as selected: the line a comment is being written
// on, when it is in this file, or nothing.
export function selectionFor(
  path: string,
  composerAnchor: CommentAnchor | null,
): SelectedLineRange | null {
  if (composerAnchor === null || composerAnchor.path !== path) return null
  const side = toDiffSide(composerAnchor.side)
  return { start: composerAnchor.line, side, end: composerAnchor.line, endSide: side }
}

function toDiffSide(side: CommentAnchor["side"]): DiffSide {
  return side === "old" ? "deletions" : "additions"
}

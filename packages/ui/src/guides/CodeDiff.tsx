import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { PatchDiff } from "@pierre/diffs/react"
import type { DraftComment, Flag, GuideId, Hunk } from "@proofroom/protocol"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { CommentComposer } from "../reviews/CommentComposer.tsx"
import { DraftCommentView } from "../reviews/DraftCommentView.tsx"
import { composerAnchorAtom, draftsAtom } from "../reviews/review-atoms.ts"
import {
  anchorForSelection,
  composerNotes,
  draftNotes,
  flagNotes,
  selectionFor,
  type CodeNote,
} from "./code-notes.ts"
import { FlagNote } from "./FlagNote.tsx"

// Code from the pull request, drawn as a diff, with notes under its lines: the
// guide's flags, the reader's draft comments, and the box for a new one.
// Hovering a line shows the diff's own button to comment on it. Chapters and the Diff tab
// both draw code through this.
export function CodeDiff({
  guideId,
  path,
  patch,
  hunks,
  flags,
}: {
  readonly guideId: GuideId
  readonly path: string
  readonly patch: string
  // The hunks in the patch, to place flags on their lines.
  readonly hunks: ReadonlyArray<Hunk>
  readonly flags: ReadonlyArray<Flag>
}) {
  const drafts = useAtomValue(draftsAtom(guideId))
  const composerAnchor = useAtomValue(composerAnchorAtom)
  const openComposer = useAtomSet(composerAnchorAtom)
  const savedDrafts: ReadonlyArray<DraftComment> = AsyncResult.isSuccess(drafts) ? drafts.value : []
  const notes = useMemo(
    () => [
      ...flagNotes(hunks, flags),
      ...draftNotes(path, savedDrafts),
      ...composerNotes(path, composerAnchor),
    ],
    [hunks, flags, path, savedDrafts, composerAnchor],
  )

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-stone-200 text-[13px]">
      <PatchDiff<CodeNote>
        patch={patch}
        disableWorkerPool
        options={{
          diffStyle: "unified",
          preferredHighlighter: "highlights",
          // The diff's own comment button, shown next to the hovered line.
          enableGutterUtility: true,
          onGutterUtilityClick: (selection) => openComposer(anchorForSelection(path, selection)),
        }}
        // The diff keeps a clicked line selected, and while a line is selected
        // it keeps its comment button there instead of following the pointer.
        // So Proofroom says what is selected: the line being commented on
        // while the box is open, nothing once it closes.
        selectedLines={selectionFor(path, composerAnchor)}
        lineAnnotations={notes}
        renderAnnotation={(annotation) => (
          <CodeNoteView guideId={guideId} note={annotation.metadata} />
        )}
      />
    </div>
  )
}

function CodeNoteView({ guideId, note }: { readonly guideId: GuideId; readonly note: CodeNote }) {
  switch (note._tag) {
    case "flag":
      return <FlagNote flag={note.flag} />
    case "draft":
      return <DraftCommentView draft={note.draft} />
    case "composer":
      return <CommentComposer guideId={guideId} anchor={note.anchor} />
  }
}

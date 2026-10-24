import { useAtomSet } from "@effect/atom-react"
import type { DraftComment } from "@proofroom/protocol"
import { Exit } from "effect"
import { useState } from "react"
import { SaveFailed } from "../components/SaveFailed.tsx"
import { deleteDraftAtom, draftsChanged, updateDraftAtom } from "./review-atoms.ts"

// A draft comment under its line, marked as not sent yet. It can be edited or
// deleted until the review is submitted.
//
// The text being edited is kept in the component while the edit is open, and
// stays open with it if saving fails, so nothing typed is lost.
export function DraftCommentView({ draft }: { readonly draft: DraftComment }) {
  const [editedBody, setEditedBody] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const updateDraft = useAtomSet(updateDraftAtom, { mode: "promiseExit" })
  const deleteDraft = useAtomSet(deleteDraftAtom)
  const reactivityKeys = [draftsChanged(draft.guideId)]

  const saveEdit = async (body: string) => {
    const exit = await updateDraft({ payload: { draftCommentId: draft.id, body }, reactivityKeys })
    setSaveFailed(Exit.isFailure(exit))
    if (Exit.isSuccess(exit)) setEditedBody(null)
  }

  return (
    <div
      className="m-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 font-sans text-sm"
      data-testid="draft-comment"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Draft · not sent yet
        </span>
        {editedBody === null && (
          <div className="flex gap-3 text-xs text-sky-800">
            <button className="hover:underline" onClick={() => setEditedBody(draft.body)}>
              Edit
            </button>
            <button
              className="hover:underline"
              onClick={() => deleteDraft({ payload: { draftCommentId: draft.id }, reactivityKeys })}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {editedBody === null ? (
        <p className="mt-1 whitespace-pre-wrap text-stone-800">{draft.body}</p>
      ) : (
        <div className="mt-2">
          <textarea
            autoFocus
            className="block min-h-20 w-full resize-y rounded border border-sky-200 bg-white p-2 outline-none focus:border-sky-400"
            value={editedBody}
            onChange={(event) => setEditedBody(event.target.value)}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {saveFailed && <SaveFailed />}
            <button
              className="rounded px-3 py-1 text-stone-600 hover:bg-white"
              onClick={() => {
                setEditedBody(null)
                setSaveFailed(false)
              }}
            >
              Cancel
            </button>
            <button
              className="rounded bg-stone-900 px-3 py-1 font-medium text-white disabled:opacity-40"
              disabled={editedBody.trim() === ""}
              onClick={() => saveEdit(editedBody)}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

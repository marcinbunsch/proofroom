import { useAtomSet } from "@effect/atom-react"
import type { CommentAnchor, GuideId } from "@proofroom/protocol"
import { Exit } from "effect"
import { useState } from "react"
import { SaveFailed } from "../components/SaveFailed.tsx"
import { addDraftAtom, composerAnchorAtom, draftsChanged } from "./review-atoms.ts"

// The box a new comment is written in, under the line it is about. Saving it
// adds a draft; nothing goes to GitHub until the review is submitted.
//
// The text being typed is kept in the component: it matters only until the
// draft is saved.
export function CommentComposer({
  guideId,
  anchor,
}: {
  readonly guideId: GuideId
  readonly anchor: CommentAnchor
}) {
  const [body, setBody] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const addDraft = useAtomSet(addDraftAtom, { mode: "promiseExit" })
  const closeComposer = useAtomSet(composerAnchorAtom)

  const save = async () => {
    setIsSaving(true)
    const exit = await addDraft({
      payload: { guideId, anchor, body },
      reactivityKeys: [draftsChanged(guideId)],
    })
    setIsSaving(false)
    setSaveFailed(Exit.isFailure(exit))
    if (Exit.isSuccess(exit)) closeComposer(null)
  }

  return (
    <div
      className="m-2 rounded-md border border-stone-300 bg-white p-2 font-sans"
      data-testid="comment-composer"
    >
      <textarea
        autoFocus
        data-testid="comment-body"
        className="block min-h-20 w-full resize-y rounded border border-stone-200 p-2 text-sm outline-none focus:border-stone-400"
        placeholder="Comment on this line"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {saveFailed && <SaveFailed />}
        <button
          className="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100"
          onClick={() => closeComposer(null)}
        >
          Cancel
        </button>
        <button
          data-testid="save-comment"
          className="rounded bg-stone-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
          disabled={isSaving || body.trim() === ""}
          onClick={save}
        >
          Add to review
        </button>
      </div>
    </div>
  )
}

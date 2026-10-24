import type { CommentAnchor, GuideId } from "@proofroom/protocol"
import { Atom } from "effect/reactivity"
import { ProofroomClient } from "../rpc/ProofroomClient.ts"

// The UI's state about reviewing a guide: its draft comments, the line a new
// comment is being written on, and the calls that change them.

// A guide's drafts. Every call that changes them passes draftsChanged(guideId)
// as its reactivity key, so the list is fetched again afterwards.
export const draftsAtom = Atom.family((guideId: GuideId) =>
  ProofroomClient.query(
    "listDraftComments",
    { guideId },
    { reactivityKeys: [draftsChanged(guideId)] },
  ),
)

export function draftsChanged(guideId: GuideId): string {
  return `drafts:${guideId}`
}

// The line a new comment is being written on, if any. One at a time.
export const composerAnchorAtom = Atom.make<CommentAnchor | null>(null)

export const addDraftAtom = ProofroomClient.mutation("addDraftComment")
export const updateDraftAtom = ProofroomClient.mutation("updateDraftComment")
export const deleteDraftAtom = ProofroomClient.mutation("deleteDraftComment")
export const submitReviewAtom = ProofroomClient.mutation("submitReview")

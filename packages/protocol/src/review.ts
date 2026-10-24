import { Schema } from "effect"
import { GuideId } from "./guide.ts"

// Reviewing a pull request from its guide: comments on lines wait as drafts in
// Proofroom, then go to GitHub together, with a summary and a verdict, as one
// review.

export const DraftCommentId = Schema.String.pipe(Schema.brand("DraftCommentId"))
export type DraftCommentId = typeof DraftCommentId.Type

// Which line a comment is on. "new" is the file after the change (added and
// unchanged lines), "old" the file before it (deleted lines). The line number
// counts lines in that version of the file.
export const CommentAnchor = Schema.Struct({
  path: Schema.String,
  side: Schema.Literals(["old", "new"]),
  line: Schema.Int,
})
export type CommentAnchor = typeof CommentAnchor.Type

export const DraftComment = Schema.Struct({
  id: DraftCommentId,
  // Drafts belong to a guide: their lines refer to the commit it explains.
  guideId: GuideId,
  anchor: CommentAnchor,
  body: Schema.String,
  createdAt: Schema.String,
})
export type DraftComment = typeof DraftComment.Type

export const ReviewVerdict = Schema.Literals(["comment", "approve", "request-changes"])
export type ReviewVerdict = typeof ReviewVerdict.Type

export class DraftCommentNotFound extends Schema.TaggedError<DraftCommentNotFound>()(
  "DraftCommentNotFound",
  { draftCommentId: DraftCommentId },
) {}

export class SubmitFailed extends Schema.TaggedError<SubmitFailed>()("SubmitFailed", {
  message: Schema.String,
}) {}

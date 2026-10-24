import { CommentAnchor, DraftCommentId, GuideId, type DraftComment } from "@proofroom/protocol"
import { Schema } from "effect"

// How draft comments are laid out in SQLite: one row per draft, with its
// anchor spread over three columns. Writes encode through this schema and
// reads decode through it, as for guides.

export const DraftCommentRow = Schema.Struct({
  id: DraftCommentId,
  guideId: GuideId,
  path: CommentAnchor.fields.path,
  side: CommentAnchor.fields.side,
  line: CommentAnchor.fields.line,
  body: Schema.String,
  createdAt: Schema.String,
})
export type DraftCommentRow = typeof DraftCommentRow.Type

export function toDraftComment(row: DraftCommentRow): DraftComment {
  return {
    id: row.id,
    guideId: row.guideId,
    anchor: { path: row.path, side: row.side, line: row.line },
    body: row.body,
    createdAt: row.createdAt,
  }
}

export function toDraftCommentRow(draft: DraftComment): DraftCommentRow {
  return {
    id: draft.id,
    guideId: draft.guideId,
    path: draft.anchor.path,
    side: draft.anchor.side,
    line: draft.anchor.line,
    body: draft.body,
    createdAt: draft.createdAt,
  }
}

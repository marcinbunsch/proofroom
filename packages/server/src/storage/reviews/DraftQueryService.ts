import {
  DraftCommentNotFound,
  type DraftComment,
  type DraftCommentId,
  type GuideId,
} from "@proofroom/protocol"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DraftCommentRow, toDraftComment } from "./rows.ts"

// Reads draft comments back out of the database. As with guides, database and
// decoding errors become defects.

export interface DraftQueries {
  // A guide's drafts, oldest first: the order they were written in.
  readonly listDrafts: (guideId: GuideId) => Effect.Effect<Array<DraftComment>>
  readonly loadDraft: (
    draftCommentId: DraftCommentId,
  ) => Effect.Effect<DraftComment, DraftCommentNotFound>
}

export class DraftQueryService extends Context.Service<DraftQueryService, DraftQueries>()(
  "proofroom/storage/reviews/DraftQueryService",
) {
  static readonly layer = Layer.effect(DraftQueryService, makeDraftQueryService())
}

// A function declaration, so the layer above can use it before this line.
function makeDraftQueryService() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return DraftQueryService.of({
      listDrafts: (guideId) => selectDrafts(sql, guideId),
      loadDraft: (draftCommentId) => selectDraft(sql, draftCommentId),
    })
  })
}

function selectDrafts(sql: SqlClient.SqlClient, guideId: GuideId) {
  return sql`SELECT * FROM draftComments WHERE guideId = ${guideId} ORDER BY createdAt, rowid`.pipe(
    Effect.flatMap(decodeDraftRows),
    Effect.map((rows) => rows.map(toDraftComment)),
    Effect.orDie,
  )
}

function selectDraft(sql: SqlClient.SqlClient, draftCommentId: DraftCommentId) {
  return Effect.gen(function* () {
    const rows = yield* sql`SELECT * FROM draftComments WHERE id = ${draftCommentId}`.pipe(
      Effect.flatMap(decodeDraftRows),
      Effect.orDie,
    )
    const row = rows[0]
    if (row === undefined) return yield* new DraftCommentNotFound({ draftCommentId })
    return toDraftComment(row)
  })
}

const decodeDraftRows = Schema.decodeUnknownEffect(Schema.Array(DraftCommentRow))

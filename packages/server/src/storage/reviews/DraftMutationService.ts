import {
  DraftCommentId,
  type CommentAnchor,
  type DraftComment,
  type DraftCommentNotFound,
  type GuideId,
} from "@proofroom/protocol"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DraftQueryService } from "./DraftQueryService.ts"
import { DraftCommentRow, toDraftCommentRow } from "./rows.ts"

// Every change to draft comments. Database errors become defects, as for
// guides.
//
// The layer brings DraftQueryService, which updates use to return the draft
// as stored.

export interface DraftMutations {
  readonly addDraft: (
    guideId: GuideId,
    anchor: CommentAnchor,
    body: string,
  ) => Effect.Effect<DraftComment>
  readonly updateDraft: (
    draftCommentId: DraftCommentId,
    body: string,
  ) => Effect.Effect<DraftComment, DraftCommentNotFound>
  readonly deleteDraft: (draftCommentId: DraftCommentId) => Effect.Effect<void>
  // After a review is submitted, the drafts it sent are on GitHub and go. A
  // draft edited since it was sent stays: GitHub only has its old text.
  readonly deleteSentDrafts: (sent: ReadonlyArray<DraftComment>) => Effect.Effect<void>
}

export class DraftMutationService extends Context.Service<DraftMutationService, DraftMutations>()(
  "proofroom/storage/reviews/DraftMutationService",
) {
  static readonly layer = Layer.effect(DraftMutationService, makeDraftMutationService()).pipe(
    Layer.provide(DraftQueryService.layer),
  )
}

// A function declaration, so the layer above can use it before this line.
function makeDraftMutationService() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const queries = yield* DraftQueryService

    return DraftMutationService.of({
      addDraft: (guideId, anchor, body) =>
        insertDraft(sql, guideId, anchor, body).pipe(Effect.orDie),
      updateDraft: (draftCommentId, body) =>
        updateDraftBody(sql, draftCommentId, body).pipe(
          Effect.orDie,
          Effect.andThen(queries.loadDraft(draftCommentId)),
        ),
      deleteDraft: (draftCommentId) =>
        Effect.asVoid(sql`DELETE FROM draftComments WHERE id = ${draftCommentId}`).pipe(
          Effect.orDie,
        ),
      deleteSentDrafts: (sent) =>
        Effect.forEach(
          sent,
          ({ id, body }) => sql`DELETE FROM draftComments WHERE id = ${id} AND body = ${body}`,
          { discard: true },
        ).pipe(sql.withTransaction, Effect.orDie),
    })
  })
}

function insertDraft(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  anchor: CommentAnchor,
  body: string,
) {
  return Effect.gen(function* () {
    const now = yield* DateTime.now
    const draft: DraftComment = {
      id: DraftCommentId.make(crypto.randomUUID()),
      guideId,
      anchor,
      body,
      createdAt: DateTime.formatIso(now),
    }
    yield* sql`INSERT INTO draftComments ${sql.insert(encodeDraftRow(toDraftCommentRow(draft)))}`
    return draft
  })
}

function updateDraftBody(sql: SqlClient.SqlClient, draftCommentId: DraftCommentId, body: string) {
  return sql`UPDATE draftComments SET body = ${body} WHERE id = ${draftCommentId}`
}

const encodeDraftRow = Schema.encodeSync(DraftCommentRow)

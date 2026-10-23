import {
  GuideNotFound,
  type Guide,
  type GuideId,
  type GuideSummary,
  type Hunk,
} from "@proofroom/protocol"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import {
  ChapterRow,
  FlagRow,
  GuideRow,
  GuideSummaryRow,
  HunkRow,
  PlacementRow,
  toGuide,
  toGuideSummary,
} from "./rows.ts"

// Everything that reads guides back out of the database: the queries, in
// GraphQL terms. GuideMutationService holds the writes, and
// GuideSubscriptionService lets the UI watch a guide as it is written.
//
// As with mutations, database and decoding errors become defects: the rows were
// written by this app through the same schemas, so a row that doesn't decode
// means the database is broken, not that the input was bad.

export interface GuideQueries {
  readonly loadGuide: (guideId: GuideId) => Effect.Effect<Guide, GuideNotFound>
  readonly listGuides: Effect.Effect<Array<GuideSummary>>
  readonly loadHunks: (guideId: GuideId) => Effect.Effect<Array<Hunk>, GuideNotFound>
}

export class GuideQueryService extends Context.Service<GuideQueryService, GuideQueries>()(
  "proofroom/storage/guides/GuideQueryService",
) {
  static readonly layer = Layer.effect(GuideQueryService, makeGuideQueryService())
}

// A function declaration, so the layer above can use it before this line.
function makeGuideQueryService() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return GuideQueryService.of({
      loadGuide: (guideId) => selectGuide(sql, guideId),
      listGuides: selectGuideSummaries(sql),
      loadHunks: (guideId) => selectHunks(sql, guideId),
    })
  })
}

function selectGuide(sql: SqlClient.SqlClient, guideId: GuideId) {
  return Effect.gen(function* () {
    const guideRows = yield* sql`SELECT * FROM guides WHERE id = ${guideId}`.pipe(
      Effect.flatMap(decodeGuideRows),
    )
    const guide = guideRows[0]
    if (guide === undefined) return yield* new GuideNotFound({ guideId })

    const chapters =
      yield* sql`SELECT * FROM chapters WHERE guideId = ${guideId} ORDER BY position`.pipe(
        Effect.flatMap(decodeChapterRows),
      )
    // rowid order is the order the planner placed things in.
    const placements =
      yield* sql`SELECT * FROM placements WHERE guideId = ${guideId} ORDER BY rowid`.pipe(
        Effect.flatMap(decodePlacementRows),
      )
    const flags = yield* sql`SELECT * FROM flags WHERE guideId = ${guideId} ORDER BY rowid`.pipe(
      Effect.flatMap(decodeFlagRows),
    )
    return toGuide({ guide, chapters, placements, flags })
  }).pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die }))
}

function selectGuideSummaries(sql: SqlClient.SqlClient) {
  return sql`SELECT * FROM guides ORDER BY createdAt DESC`.pipe(
    Effect.flatMap(decodeGuideSummaryRows),
    Effect.map((rows) => rows.map(toGuideSummary)),
    Effect.orDie,
  )
}

function selectHunks(sql: SqlClient.SqlClient, guideId: GuideId) {
  return Effect.gen(function* () {
    // A guide with no hunks is possible (a pull request that only renames
    // files), so the guide itself is looked up to tell that apart from a
    // guide that doesn't exist.
    yield* selectGuide(sql, guideId)
    const rows = yield* sql`SELECT * FROM hunks WHERE guideId = ${guideId} ORDER BY position`.pipe(
      Effect.flatMap(decodeHunkRows),
      Effect.orDie,
    )
    return rows.map((row) => row.hunk)
  })
}

// --- decoding --------------------------------------------------------------------

const decodeGuideRows = Schema.decodeUnknownEffect(Schema.Array(GuideRow))
const decodeChapterRows = Schema.decodeUnknownEffect(Schema.Array(ChapterRow))
const decodePlacementRows = Schema.decodeUnknownEffect(Schema.Array(PlacementRow))
const decodeFlagRows = Schema.decodeUnknownEffect(Schema.Array(FlagRow))
const decodeHunkRows = Schema.decodeUnknownEffect(Schema.Array(HunkRow))
const decodeGuideSummaryRows = Schema.decodeUnknownEffect(Schema.Array(GuideSummaryRow))

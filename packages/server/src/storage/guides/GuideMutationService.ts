import {
  GuideId,
  type AgentCli,
  type ChapterKey,
  type ChapterStatus,
  type Excerpt,
  type Flag,
  type GuideStatus,
  type Hunk,
  type MermaidDiagram,
  type Placement,
  type PullRequestRef,
} from "@proofroom/protocol"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import { GuideSubscriptionService } from "./GuideSubscriptionService.ts"
import { ChapterRow, ExcerptRow, FlagRow, GuideRow, HunkRow, PlacementRow } from "./rows.ts"

// Every change to a guide, one write per function: the mutations, in GraphQL
// terms. GuideQueryService holds the reads.
//
// After each write that a reader of the guide can see, GuideSubscriptionService
// is told, so anyone watching the guide sees the change.
//
// Database errors become defects. A broken local SQLite file in the middle of a
// run has no sensible fallback, and callers shouldn't have to handle SqlError.

export interface GuideMutations {
  // The guide and its pull request's hunks, saved together: a guide is never
  // there without the hunks it is about.
  readonly createGuide: (guide: NewGuide) => Effect.Effect<GuideId>
  readonly setGuideStatus: (
    guideId: GuideId,
    status: GuideStatus,
    failure: string | null,
  ) => Effect.Effect<void>
  readonly setOverview: (guideId: GuideId, overview: Overview) => Effect.Effect<void>
  readonly addChapter: (guideId: GuideId, chapter: NewChapter) => Effect.Effect<void>
  // Replaces every earlier placement of the same hunks, so the planner fixes a
  // hunk by placing all of it again.
  readonly replacePlacements: (
    guideId: GuideId,
    placements: ReadonlyArray<Placement>,
  ) => Effect.Effect<void>
  readonly setChapterStatus: (
    guideId: GuideId,
    chapterKey: ChapterKey,
    status: ChapterStatus,
    failure: string | null,
  ) => Effect.Effect<void>
  readonly writeChapter: (
    guideId: GuideId,
    chapterKey: ChapterKey,
    text: ChapterText,
  ) => Effect.Effect<void>
  readonly addExcerpt: (
    guideId: GuideId,
    chapterKey: ChapterKey,
    excerpt: Excerpt,
  ) => Effect.Effect<void>
  readonly addFlag: (guideId: GuideId, chapterKey: ChapterKey, flag: Flag) => Effect.Effect<void>
  // Fails every guide still being planned or written whose writer process has
  // stopped, and its unfinished chapters, with the reason.
  readonly failAbandonedGuides: (
    reason: string,
    isWriterRunning: (writerPid: number) => boolean,
  ) => Effect.Effect<void>
}

export interface NewGuide {
  readonly pullRequest: PullRequestRef
  readonly title: string
  readonly headSha: string
  readonly mergeBaseSha: string
  readonly cli: AgentCli
  readonly hunks: ReadonlyArray<Hunk>
  // The process that will write the guide.
  readonly writerPid: number
}

export interface Overview {
  readonly summary: string
  readonly diagram: MermaidDiagram | null
}

export interface NewChapter {
  readonly key: ChapterKey
  readonly title: string
  readonly purpose: string
}

export interface ChapterText {
  readonly body: string
  readonly diagram: MermaidDiagram | null
}

export class GuideMutationService extends Context.Service<GuideMutationService, GuideMutations>()(
  "proofroom/storage/guides/GuideMutationService",
) {
  // Needs only the database from outside; the subscription service it
  // announces through is provided here.
  static readonly layer = Layer.effect(GuideMutationService, makeGuideMutationService()).pipe(
    Layer.provide(GuideSubscriptionService.layer),
  )
}

// A function declaration, so the layer above can use it before this line.
function makeGuideMutationService() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const subscriptions = yield* GuideSubscriptionService

    const thenAnnounce =
      (guideId: GuideId) =>
      <E>(write: Effect.Effect<unknown, E>) =>
        write.pipe(Effect.andThen(subscriptions.announceChange(guideId)), Effect.orDie)

    return GuideMutationService.of({
      createGuide: (guide) => insertGuide(sql, guide).pipe(Effect.orDie),
      setGuideStatus: (guideId, status, failure) =>
        updateGuideStatus(sql, guideId, status, failure).pipe(thenAnnounce(guideId)),
      setOverview: (guideId, overview) =>
        updateOverview(sql, guideId, overview).pipe(thenAnnounce(guideId)),
      addChapter: (guideId, chapter) =>
        insertChapter(sql, guideId, chapter).pipe(thenAnnounce(guideId)),
      replacePlacements: (guideId, placements) =>
        replaceHunkPlacements(sql, guideId, placements).pipe(thenAnnounce(guideId)),
      setChapterStatus: (guideId, chapterKey, status, failure) =>
        updateChapterStatus(sql, guideId, chapterKey, status, failure).pipe(thenAnnounce(guideId)),
      writeChapter: (guideId, chapterKey, text) =>
        updateChapterText(sql, guideId, chapterKey, text).pipe(thenAnnounce(guideId)),
      addExcerpt: (guideId, chapterKey, excerpt) =>
        insertExcerpt(sql, guideId, chapterKey, excerpt).pipe(thenAnnounce(guideId)),
      addFlag: (guideId, chapterKey, flag) =>
        insertFlag(sql, guideId, chapterKey, flag).pipe(thenAnnounce(guideId)),
      failAbandonedGuides: (reason, isWriterRunning) =>
        failAbandoned(sql, reason, isWriterRunning).pipe(Effect.orDie),
    })
  })
}

// --- guides --------------------------------------------------------------------

function insertGuide(sql: SqlClient.SqlClient, guide: NewGuide) {
  return Effect.gen(function* () {
    const now = yield* DateTime.now
    const row: GuideRow = {
      id: GuideId.make(crypto.randomUUID()),
      owner: guide.pullRequest.owner,
      repo: guide.pullRequest.repo,
      number: guide.pullRequest.number,
      title: guide.title,
      headSha: guide.headSha,
      mergeBaseSha: guide.mergeBaseSha,
      cli: guide.cli,
      status: "planning",
      summary: null,
      overviewDiagram: null,
      failure: null,
      createdAt: DateTime.formatIso(now),
      writerPid: guide.writerPid,
    }
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO guides ${sql.insert(encodeGuideRow(row))}`
        yield* insertHunks(sql, row.id, guide.hunks)
      }),
    )
    return row.id
  })
}

function updateGuideStatus(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  status: GuideStatus,
  failure: string | null,
) {
  return sql`UPDATE guides SET status = ${status}, failure = ${failure} WHERE id = ${guideId}`
}

function failAbandoned(
  sql: SqlClient.SqlClient,
  reason: string,
  isWriterRunning: (writerPid: number) => boolean,
) {
  return sql.withTransaction(
    Effect.gen(function* () {
      const unfinished = yield* sql<{ readonly id: string; readonly writerPid: number | null }>`
        SELECT id, writerPid FROM guides WHERE status IN ('planning', 'writing')
      `
      const abandonedIds = unfinished
        .filter(({ writerPid }) => writerPid === null || !isWriterRunning(writerPid))
        .map(({ id }) => id)
      if (abandonedIds.length === 0) return
      yield* sql`
        UPDATE chapters SET status = 'failed', failure = ${reason}
        WHERE status IN ('waiting', 'writing') AND ${sql.in("guideId", abandonedIds)}
      `
      yield* sql`
        UPDATE guides SET status = 'failed', failure = ${reason}
        WHERE ${sql.in("id", abandonedIds)}
      `
    }),
  )
}

function updateOverview(sql: SqlClient.SqlClient, guideId: GuideId, overview: Overview) {
  const diagram = encodeDiagram(overview.diagram)
  return sql`UPDATE guides SET summary = ${overview.summary}, overviewDiagram = ${diagram} WHERE id = ${guideId}`
}

// --- hunks ---------------------------------------------------------------------

function insertHunks(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  hunks: ReadonlyArray<Hunk>,
): Effect.Effect<void, SqlError.SqlError> {
  if (hunks.length === 0) return Effect.void
  const rows = hunks.map((hunk, position) => ({
    guideId,
    ...encodeHunkRow({ id: hunk.id, position, hunk }),
  }))
  return Effect.asVoid(sql`INSERT INTO hunks ${sql.insert(rows)}`)
}

function replaceHunkPlacements(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  placements: ReadonlyArray<Placement>,
): Effect.Effect<void, SqlError.SqlError> {
  if (placements.length === 0) return Effect.void
  const placedHunkIds = [...new Set(placements.map((placement) => placement.hunkId))]
  const rows = placements.map((placement) => ({ guideId, ...encodePlacementRow(placement) }))
  return sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`DELETE FROM placements WHERE guideId = ${guideId} AND ${sql.in("hunkId", placedHunkIds)}`
      yield* sql`INSERT INTO placements ${sql.insert(rows)}`
    }),
  )
}

// --- chapters ------------------------------------------------------------------

// The new chapter goes after the existing ones; the planner adds them in
// reading order.
function insertChapter(sql: SqlClient.SqlClient, guideId: GuideId, chapter: NewChapter) {
  return sql`
    INSERT INTO chapters (guideId, key, position, title, purpose, status)
    VALUES (
      ${guideId},
      ${chapter.key},
      (SELECT COUNT(*) FROM chapters WHERE guideId = ${guideId}),
      ${chapter.title},
      ${chapter.purpose},
      ${"waiting" satisfies ChapterStatus}
    )
  `
}

function updateChapterStatus(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  chapterKey: ChapterKey,
  status: ChapterStatus,
  failure: string | null,
) {
  return sql`
    UPDATE chapters SET status = ${status}, failure = ${failure}
    WHERE guideId = ${guideId} AND key = ${chapterKey}
  `
}

function updateChapterText(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  chapterKey: ChapterKey,
  text: ChapterText,
) {
  const diagram = encodeDiagram(text.diagram)
  return sql`
    UPDATE chapters SET body = ${text.body}, diagram = ${diagram}
    WHERE guideId = ${guideId} AND key = ${chapterKey}
  `
}

function insertExcerpt(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  chapterKey: ChapterKey,
  excerpt: Excerpt,
) {
  const row = encodeExcerptRow({ chapterKey, ...excerpt })
  return sql`INSERT INTO excerpts ${sql.insert({ guideId, ...row })}`
}

function insertFlag(
  sql: SqlClient.SqlClient,
  guideId: GuideId,
  chapterKey: ChapterKey,
  flag: Flag,
) {
  const row = encodeFlagRow({ chapterKey, ...flag })
  return sql`INSERT INTO flags ${sql.insert({ guideId, ...row })}`
}

// --- encoding --------------------------------------------------------------------

const encodeGuideRow = Schema.encodeSync(GuideRow)
const encodeHunkRow = Schema.encodeSync(HunkRow)
const encodePlacementRow = Schema.encodeSync(PlacementRow)
const encodeExcerptRow = Schema.encodeSync(ExcerptRow)
const encodeFlagRow = Schema.encodeSync(FlagRow)
const encodeDiagram = Schema.encodeSync(ChapterRow.fields.diagram)

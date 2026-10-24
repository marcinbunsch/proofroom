import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

// The SQLite database, migrated before anything uses it. Proofroom keeps one
// file in its home folder; tests pass ":memory:".
export function databaseLayer(filename: string) {
  return SqliteMigrator.layer({ loader: migrations }).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename })),
  )
}

// Column names match the row schemas in guides/rows.ts and reviews/rows.ts.
const migrations = SqliteMigrator.fromRecord({
  "0001_guides": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE guides (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        headSha TEXT NOT NULL,
        mergeBaseSha TEXT NOT NULL,
        cli TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        overviewDiagram TEXT,
        failure TEXT,
        createdAt TEXT NOT NULL
      )
    `
    yield* sql`
      CREATE TABLE hunks (
        guideId TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL,
        hunk TEXT NOT NULL,
        PRIMARY KEY (guideId, id)
      )
    `
    yield* sql`
      CREATE TABLE chapters (
        guideId TEXT NOT NULL,
        key TEXT NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL,
        body TEXT,
        diagram TEXT,
        failure TEXT,
        PRIMARY KEY (guideId, key)
      )
    `
    yield* sql`
      CREATE TABLE placements (
        guideId TEXT NOT NULL,
        hunkId TEXT NOT NULL,
        lines TEXT,
        target TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX placementsByHunk ON placements (guideId, hunkId)`
    yield* sql`
      CREATE TABLE flags (
        guideId TEXT NOT NULL,
        chapterKey TEXT NOT NULL,
        hunkId TEXT NOT NULL,
        line INTEGER NOT NULL,
        kind TEXT NOT NULL,
        note TEXT NOT NULL
      )
    `
  }),
  "0002_draft_comments": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE draftComments (
        id TEXT PRIMARY KEY,
        guideId TEXT NOT NULL,
        path TEXT NOT NULL,
        side TEXT NOT NULL,
        line INTEGER NOT NULL,
        body TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX draftCommentsByGuide ON draftComments (guideId)`
  }),
  "0003_excerpts": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE excerpts (
        guideId TEXT NOT NULL,
        chapterKey TEXT NOT NULL,
        hunkId TEXT NOT NULL,
        lines TEXT NOT NULL,
        why TEXT NOT NULL
      )
    `
  }),
})

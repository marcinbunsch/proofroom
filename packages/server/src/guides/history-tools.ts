import {
  HistoryToolkit,
  ToolRejected,
  type GitBlame,
  type GitLog,
  type GitShow,
} from "@proofroom/protocol"
import { Effect } from "effect"
import type { Tool } from "effect/ai"
import { ChildProcessSpawner } from "effect/process"
import { runGit } from "../pull-requests/run-git.ts"

// The history tools for one run, reading the guide's checkout. Every argument
// the agent gives lands after git's own options, and paths after `--`, so it
// can only ever name a commit or a file, never change what git does.

export function historyToolHandlers(checkout: string) {
  return HistoryToolkit.toLayer(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const git: ReadGit = (args) =>
        runGit(spawner, args, checkout).pipe(
          Effect.map(cutToLength),
          Effect.mapError((error) => new ToolRejected({ message: error.message })),
        )
      return {
        git_log: (parameters) => gitLog(git, parameters),
        git_show: (parameters) => gitShow(git, parameters),
        git_blame: (parameters) => gitBlame(git, parameters),
      }
    }),
  )
}

type ReadGit = (args: ReadonlyArray<string>) => Effect.Effect<string, ToolRejected>

// --- the tools ---------------------------------------------------------------------

function gitLog(git: ReadGit, { path, maxCount }: Tool.Parameters<typeof GitLog>) {
  return git([
    "log",
    `--max-count=${maxCount}`,
    "--date=short",
    "--format=%h %ad %an: %s",
    "--",
    path,
  ]).pipe(Effect.map((output) => output || `No commits changed ${path}.`))
}

// No external diff tools or text conversions: those would run programs the
// repository's attributes name.
function gitShow(git: ReadGit, { commit, path }: Tool.Parameters<typeof GitShow>) {
  return git([
    "show",
    "--no-ext-diff",
    "--no-textconv",
    "--stat",
    "--patch",
    commit,
    "--",
    ...(path === null ? [] : [path]),
  ])
}

function gitBlame(git: ReadGit, { path, firstLine, lastLine }: Tool.Parameters<typeof GitBlame>) {
  if (lastLine < firstLine) {
    return Effect.fail(new ToolRejected({ message: "lastLine comes before firstLine." }))
  }
  return git(["blame", "--date=short", "-L", `${firstLine},${lastLine}`, "--", path])
}

// --- output ------------------------------------------------------------------------

// 30,000 characters: a big commit's patch can run to megabytes, which would
// crowd out everything else the agent is reading.
const maxOutputLength = 30_000

function cutToLength(output: string): string {
  if (output.length <= maxOutputLength) return output
  const cut = output.length - maxOutputLength
  return `${output.slice(0, maxOutputLength)}\n… ${cut} more characters cut.`
}

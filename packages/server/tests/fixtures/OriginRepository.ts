import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// A repository on disk standing in for one on GitHub. Proofroom clones and
// fetches from it as it would from github.com, including the
// refs/pull/<number>/head ref GitHub keeps for every pull request.
//
// Commits are made with git config isolated from the developer's own, so a
// global setting like commit signing can't break the tests.
export class OriginRepository {
  private constructor(readonly path: string) {}

  static create(path: string): OriginRepository {
    mkdirSync(path, { recursive: true })
    const origin = new OriginRepository(path)
    origin.git("init", "--quiet", "--initial-branch=main")
    return origin
  }

  // Writes the files and commits them, returning the new commit's sha.
  commit(message: string, files: Record<string, string>): string {
    for (const [file, content] of Object.entries(files)) {
      const filePath = join(this.path, file)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content)
    }
    this.git("add", "--all")
    this.git("commit", "--quiet", "--message", message)
    return this.git("rev-parse", "HEAD").trim()
  }

  switchTo(branch: string, options: { readonly create: boolean } = { create: false }): void {
    this.git("switch", "--quiet", ...(options.create ? ["--create"] : []), branch)
  }

  // Points GitHub's ref for the pull request at a commit, as a push to the
  // pull request's branch would.
  publishPullRequest(number: number, sha: string): void {
    this.git("update-ref", `refs/pull/${number}/head`, sha)
  }

  private git(...args: Array<string>): string {
    return execFileSync("git", args, {
      cwd: this.path,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Ada Reviewer",
        GIT_AUTHOR_EMAIL: "ada@acme.example",
        GIT_COMMITTER_NAME: "Ada Reviewer",
        GIT_COMMITTER_EMAIL: "ada@acme.example",
      },
    })
  }
}

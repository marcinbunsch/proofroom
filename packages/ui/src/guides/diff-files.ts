import type { Hunk } from "@proofroom/protocol"

// The pull request's changed files, in the order the diff lists them, each
// with its hunks. The Diff tab shows one box per file.

export interface DiffFile {
  readonly path: string
  readonly hunks: readonly [Hunk, ...Array<Hunk>]
}

export function groupHunksByFile(hunks: ReadonlyArray<Hunk>): Array<DiffFile> {
  const files: Array<{ path: string; hunks: [Hunk, ...Array<Hunk>] }> = []
  for (const hunk of hunks) {
    const currentFile = files.at(-1)
    if (currentFile?.path === hunk.path) currentFile.hunks.push(hunk)
    else files.push({ path: hunk.path, hunks: [hunk] })
  }
  return files
}

import type { Flag, Hunk } from "@proofroom/protocol"
import { useMemo } from "react"
import { CodeDiff } from "./CodeDiff.tsx"
import { groupHunksByFile, type DiffFile } from "./diff-files.ts"
import { flagAnnotations } from "./flag-annotations.ts"
import { filePatch } from "./hunk-patch.ts"

// The Diff tab: the whole pull request as an ordinary diff, file by file, with
// every chapter's flags on it. For when the guide isn't enough and you want to
// read the code itself.
export function DiffView({
  hunks,
  flags,
}: {
  readonly hunks: ReadonlyArray<Hunk>
  readonly flags: ReadonlyArray<Flag>
}) {
  const files = useMemo(() => groupHunksByFile(hunks), [hunks])
  return (
    <div className="mt-8">
      <p className="text-sm text-stone-500">
        {files.length} {files.length === 1 ? "file" : "files"} changed
      </p>
      {files.map((file) => (
        <FileDiff key={file.path} file={file} flags={flags} />
      ))}
    </div>
  )
}

function FileDiff({
  file,
  flags,
}: {
  readonly file: DiffFile
  readonly flags: ReadonlyArray<Flag>
}) {
  const patch = useMemo(() => filePatch(file.hunks), [file])
  const annotations = useMemo(() => flagAnnotations(file.hunks, flags), [file, flags])
  return <CodeDiff patch={patch} flags={annotations} />
}

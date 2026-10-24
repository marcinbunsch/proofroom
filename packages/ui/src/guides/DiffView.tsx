import type { Flag, GuideId, Hunk } from "@proofroom/protocol"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useEffect, useMemo } from "react"
import { CodeDiff } from "./CodeDiff.tsx"
import { groupHunksByFile, type DiffFile } from "./diff-files.ts"
import { diffScrollTargetAtom } from "./guide-atoms.ts"
import { filePatch } from "./hunk-patch.ts"

// The Diff tab: the whole pull request as an ordinary diff, file by file, with
// every chapter's flags on it. For when the guide isn't enough and you want to
// read the code itself.
export function DiffView({
  guideId,
  hunks,
  flags,
}: {
  readonly guideId: GuideId
  readonly hunks: ReadonlyArray<Hunk>
  readonly flags: ReadonlyArray<Flag>
}) {
  const files = useMemo(() => groupHunksByFile(hunks), [hunks])
  useScrollToRequestedFile()
  return (
    <div className="mt-8">
      <p className="text-sm text-stone-500">
        {files.length} {files.length === 1 ? "file" : "files"} changed
      </p>
      {files.map((file) => (
        <FileDiff key={file.path} guideId={guideId} file={file} flags={flags} />
      ))}
    </div>
  )
}

function FileDiff({
  guideId,
  file,
  flags,
}: {
  readonly guideId: GuideId
  readonly file: DiffFile
  readonly flags: ReadonlyArray<Flag>
}) {
  const patch = useMemo(() => filePatch(file.hunks), [file])
  return (
    <div data-file-path={file.path}>
      <CodeDiff guideId={guideId} path={file.path} patch={patch} hunks={file.hunks} flags={flags} />
    </div>
  )
}

// A chapter's "Open in Diff" names a file to show; scroll to it once, then
// forget it.
function useScrollToRequestedFile() {
  const requestedPath = useAtomValue(diffScrollTargetAtom)
  const clearRequest = useAtomSet(diffScrollTargetAtom)
  useEffect(() => {
    if (requestedPath === null) return
    const fileElement = document.querySelector(`[data-file-path="${CSS.escape(requestedPath)}"]`)
    fileElement?.scrollIntoView({ block: "start" })
    clearRequest(null)
  }, [requestedPath, clearRequest])
}

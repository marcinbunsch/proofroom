import type { Flag, GuideId, Hunk, HunkLineRange } from "@proofroom/protocol"
import { useMemo } from "react"
import { CodeDiff } from "./CodeDiff.tsx"
import { hunkPatch } from "./hunk-patch.ts"

// The real code of a hunk, or of the part of it placed in a chapter, with the
// chapter's flags on it.
export function HunkView({
  guideId,
  hunk,
  lines,
  flags,
}: {
  readonly guideId: GuideId
  readonly hunk: Hunk
  readonly lines: HunkLineRange | null
  readonly flags: ReadonlyArray<Flag>
}) {
  const patch = useMemo(() => hunkPatch(hunk, lines), [hunk, lines])
  return <CodeDiff guideId={guideId} path={hunk.path} patch={patch} hunks={[hunk]} flags={flags} />
}

import type { Flag, Hunk, HunkLineRange } from "@proofroom/protocol"
import { useMemo } from "react"
import { CodeDiff } from "./CodeDiff.tsx"
import { flagAnnotations } from "./flag-annotations.ts"
import { hunkPatch } from "./hunk-patch.ts"

// The real code of a hunk, or of the part of it placed in a chapter, with the
// chapter's flags on it.
export function HunkView({
  hunk,
  lines,
  flags,
}: {
  readonly hunk: Hunk
  readonly lines: HunkLineRange | null
  readonly flags: ReadonlyArray<Flag>
}) {
  const patch = useMemo(() => hunkPatch(hunk, lines), [hunk, lines])
  const annotations = useMemo(() => flagAnnotations([hunk], flags), [hunk, flags])
  return <CodeDiff patch={patch} flags={annotations} />
}

import type { DiffLineAnnotation } from "@pierre/diffs"
import { PatchDiff } from "@pierre/diffs/react"
import type { Flag, Hunk, HunkLineRange } from "@proofroom/protocol"
import { useMemo } from "react"
import { hunkPatch } from "./hunk-patch.ts"

// The real code of a hunk, or of the part of it placed in a chapter, with the
// chapter's flags shown under the lines they point at.
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
  const annotations = useMemo(
    () => flags.flatMap((flag) => flagAnnotation(hunk, flag)),
    [hunk, flags],
  )
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-stone-200 text-[13px]">
      <PatchDiff<Flag>
        patch={patch}
        disableWorkerPool
        options={{ diffStyle: "unified", preferredHighlighter: "highlights" }}
        lineAnnotations={annotations}
        renderAnnotation={(annotation) => <FlagNote flag={annotation.metadata} />}
      />
    </div>
  )
}

// Flags count lines within the hunk; the diff view counts lines in the file,
// on the side the line exists on.
function flagAnnotation(hunk: Hunk, flag: Flag): Array<DiffLineAnnotation<Flag>> {
  const line = hunk.lines[flag.line - 1]
  if (line === undefined) return []
  if (line.kind === "deletion" && line.oldLineNumber !== null) {
    return [{ side: "deletions", lineNumber: line.oldLineNumber, metadata: flag }]
  }
  if (line.newLineNumber !== null) {
    return [{ side: "additions", lineNumber: line.newLineNumber, metadata: flag }]
  }
  return []
}

function FlagNote({ flag }: { readonly flag: Flag }) {
  return (
    <div className="m-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-sm text-amber-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        {flagLabels[flag.kind]}
      </div>
      <div className="mt-1">{flag.note}</div>
    </div>
  )
}

const flagLabels: Record<Flag["kind"], string> = {
  "risky-logic": "Risky logic",
  "hidden-behaviour-change": "Hidden change in behaviour",
  "missing-tests": "Missing tests",
  "contradicts-description": "Contradicts the description",
}

import { PatchDiff } from "@pierre/diffs/react"
import type { Flag } from "@proofroom/protocol"
import type { FlagAnnotation } from "./flag-annotations.ts"

// Code from the pull request, drawn as a diff, with flags under the lines they
// point at. Chapters and the Diff tab both draw code through this.
export function CodeDiff({
  patch,
  flags,
}: {
  readonly patch: string
  readonly flags: ReadonlyArray<FlagAnnotation>
}) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-stone-200 text-[13px]">
      <PatchDiff<Flag>
        patch={patch}
        disableWorkerPool
        options={{ diffStyle: "unified", preferredHighlighter: "highlights" }}
        lineAnnotations={[...flags]}
        renderAnnotation={(annotation) => <FlagNote flag={annotation.metadata} />}
      />
    </div>
  )
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

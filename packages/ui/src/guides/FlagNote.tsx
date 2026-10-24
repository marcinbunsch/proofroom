import type { Flag } from "@proofroom/protocol"

// A flag from the guide, under the line it points at: where to look and why.
export function FlagNote({ flag }: { readonly flag: Flag }) {
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

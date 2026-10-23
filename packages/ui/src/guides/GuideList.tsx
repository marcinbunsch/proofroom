import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GuideSummary } from "@proofroom/protocol"
import { AsyncResult } from "effect/reactivity"
import { StatusBadge } from "../components/StatusBadge.tsx"
import { guideListAtom, selectedGuideIdAtom } from "./guide-atoms.ts"

// Every guide written so far, newest first.
export function GuideList() {
  const guides = useAtomValue(guideListAtom)
  const selectedGuideId = useAtomValue(selectedGuideIdAtom)
  const selectGuide = useAtomSet(selectedGuideIdAtom)

  if (!AsyncResult.isSuccess(guides)) return null
  return (
    <nav className="flex flex-col gap-1">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Guides</h2>
      {guides.value.map((guide) => (
        <button
          key={guide.id}
          onClick={() => selectGuide(guide.id)}
          className={`rounded-md px-3 py-2 text-left text-sm hover:bg-stone-100 ${guide.id === selectedGuideId ? "bg-stone-100" : ""}`}
        >
          <div className="line-clamp-2 font-medium">{guide.title}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
            <span>{pullRequestLabel(guide)}</span>
            <StatusBadge status={guide.status} />
          </div>
        </button>
      ))}
    </nav>
  )
}

function pullRequestLabel(guide: GuideSummary): string {
  return `${guide.pullRequest.owner}/${guide.pullRequest.repo}#${guide.pullRequest.number}`
}

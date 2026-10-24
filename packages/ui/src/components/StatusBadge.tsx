import type { ChapterStatus, GuideStatus } from "@proofroom/protocol"

// How far a guide or chapter has got, as a small coloured label.
export function StatusBadge({ status }: { readonly status: GuideStatus | ChapterStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${statusColours[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

const statusLabels: Record<GuideStatus | ChapterStatus, string> = {
  planning: "planning",
  waiting: "waiting",
  writing: "writing",
  done: "done",
  failed: "failed",
}

const statusColours: Record<GuideStatus | ChapterStatus, string> = {
  planning: "bg-sky-100 text-sky-800",
  waiting: "bg-stone-100 text-stone-600",
  writing: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
}

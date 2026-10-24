import type { ApiChangeVisual, ApiEntry } from "@proofroom/protocol"
import { VisualFrame } from "./VisualFrame.tsx"

// What callers see, one entry per line: added, removed, or changed from one
// signature to another, with what a caller has to do about it.
export function ApiChangeView({ visual }: { readonly visual: ApiChangeVisual }) {
  return (
    <VisualFrame title={visual.title}>
      <ul className="divide-y divide-stone-100 text-sm" data-testid="api-change">
        {visual.entries.map((entry, index) => (
          <li key={index} className="flex gap-3 px-4 py-2">
            <ChangeBadge change={entryChange(entry)} />
            <div className="min-w-0 flex-1">
              {entry.before !== null && (
                <code className="block break-words font-mono text-[13px] text-red-800 line-through decoration-red-300">
                  {entry.before}
                </code>
              )}
              {entry.after !== null && (
                <code className="block break-words font-mono text-[13px] text-emerald-900">
                  {entry.after}
                </code>
              )}
              {entry.note !== null && <p className="mt-1 text-stone-600">{entry.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </VisualFrame>
  )
}

type EntryChange = "added" | "removed" | "changed"

function entryChange(entry: ApiEntry): EntryChange {
  if (entry.before === null) return "added"
  if (entry.after === null) return "removed"
  return "changed"
}

function ChangeBadge({ change }: { readonly change: EntryChange }) {
  return (
    <span
      className={`mt-0.5 h-fit w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs ${badgeColours[change]}`}
    >
      {change}
    </span>
  )
}

const badgeColours: Record<EntryChange, string> = {
  added: "bg-emerald-100 text-emerald-800",
  removed: "bg-red-100 text-red-800",
  changed: "bg-amber-100 text-amber-800",
}

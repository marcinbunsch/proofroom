import type { AppendixKind, Hunk, HunkId, Placement } from "@proofroom/protocol"
import { HunkView } from "./HunkView.tsx"

// The appendix: changes the reader can trust without reading, grouped by
// kind. Each group is folded; the code is one click away.
export function RoutineChanges({
  placements,
  hunksById,
}: {
  readonly placements: ReadonlyArray<Placement>
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
}) {
  const kinds = appendixKinds.filter((kind) =>
    placements.some((placement) => placementKind(placement) === kind),
  )
  if (kinds.length === 0) return null
  return (
    <section className="mt-16 border-t border-stone-200 pt-8">
      <h2 className="text-lg font-semibold tracking-tight">Routine changes</h2>
      {kinds.map((kind) => {
        const placementsOfKind = placements.filter((placement) => placementKind(placement) === kind)
        return (
          <details key={kind} className="mt-4">
            <summary className="cursor-pointer text-sm text-stone-700">
              {appendixLabels[kind]} · {placementsOfKind.length}{" "}
              {placementsOfKind.length === 1 ? "change" : "changes"}
            </summary>
            {placementsOfKind.map((placement, index) => {
              const hunk = hunksById.get(placement.hunkId)
              return hunk === undefined ? null : (
                <HunkView
                  key={`${hunk.id}-${index}`}
                  hunk={hunk}
                  lines={placement.lines}
                  flags={[]}
                />
              )
            })}
          </details>
        )
      })}
    </section>
  )
}

function placementKind(placement: Placement): AppendixKind | null {
  return placement.target._tag === "appendix" ? placement.target.kind : null
}

const appendixKinds: ReadonlyArray<AppendixKind> = [
  "renames",
  "mechanical",
  "tests",
  "formatting",
  "generated",
  "lockfiles",
]

const appendixLabels: Record<AppendixKind, string> = {
  renames: "Renames and moves",
  mechanical: "Mechanical updates",
  tests: "Tests that follow the change",
  formatting: "Formatting",
  generated: "Generated files",
  lockfiles: "Lockfiles",
}

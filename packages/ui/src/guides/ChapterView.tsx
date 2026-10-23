import type { Chapter, Hunk, HunkId, Placement } from "@proofroom/protocol"
import { AgentText } from "../components/AgentText.tsx"
import { MermaidDiagram } from "../components/MermaidDiagram.tsx"
import { StatusBadge } from "../components/StatusBadge.tsx"
import { HunkView } from "./HunkView.tsx"

// One chapter: its text and diagram once written, and the code placed in it.
// While it waits to be written, the planner's one-line purpose stands in.
export function ChapterView({
  chapter,
  placements,
  hunksById,
}: {
  readonly chapter: Chapter
  readonly placements: ReadonlyArray<Placement>
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
}) {
  return (
    <section className="mt-14" data-testid={`chapter-${chapter.key}`}>
      <header className="flex items-baseline gap-3">
        <span className="text-sm font-medium text-stone-400">{chapter.position + 1}</span>
        <h2 className="text-xl font-semibold tracking-tight">{chapter.title}</h2>
        <StatusBadge status={chapter.status} />
      </header>
      {chapter.body === null ? (
        <p className="mt-3 text-stone-500">{chapter.purpose}</p>
      ) : (
        <AgentText markdown={chapter.body} className="text-[15px] text-stone-800" />
      )}
      {chapter.failure !== null && <p className="mt-3 text-sm text-red-700">{chapter.failure}</p>}
      {chapter.diagram !== null && <MermaidDiagram diagram={chapter.diagram} />}
      {placements.map((placement, index) => {
        const hunk = hunksById.get(placement.hunkId)
        if (hunk === undefined) return null
        const flags = chapter.flags.filter((flag) => flag.hunkId === hunk.id)
        return (
          <HunkView key={`${hunk.id}-${index}`} hunk={hunk} lines={placement.lines} flags={flags} />
        )
      })}
    </section>
  )
}

import { useAtomSet } from "@effect/atom-react"
import type { Chapter, Excerpt, Flag, GuideId, Hunk, HunkId, Placement } from "@proofroom/protocol"
import { useMemo } from "react"
import { AgentText } from "../components/AgentText.tsx"
import { MermaidDiagram } from "../components/MermaidDiagram.tsx"
import { StatusBadge } from "../components/StatusBadge.tsx"
import { chapterCode, flagLocation, flagsOutsideExcerpts } from "./chapter-code.ts"
import { FlagNote } from "./FlagNote.tsx"
import { diffScrollTargetAtom, guideTabAtom } from "./guide-atoms.ts"
import { HunkView } from "./HunkView.tsx"

// One chapter. It explains its part of the change in text and a diagram, and
// guides the reader's focus with a few excerpts of code worth seeing. The rest
// of its code is one click away on the Diff tab.
//
// While it waits to be written, the planner's one-line purpose stands in.
export function ChapterView({
  guideId,
  chapter,
  placements,
  hunksById,
}: {
  readonly guideId: GuideId
  readonly chapter: Chapter
  readonly placements: ReadonlyArray<Placement>
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
}) {
  const code = useMemo(() => chapterCode(placements, hunksById), [placements, hunksById])
  const otherFlags = flagsOutsideExcerpts(chapter)
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
      {chapter.excerpts.map((excerpt, index) => (
        <ExcerptView
          key={`${excerpt.hunkId}-${index}`}
          guideId={guideId}
          excerpt={excerpt}
          hunksById={hunksById}
          flags={chapter.flags}
        />
      ))}
      {otherFlags.length > 0 && <FlagsElsewhere flags={otherFlags} hunksById={hunksById} />}
      {code.fileCount > 0 && (
        <OpenInDiff
          path={code.firstPath}
          label={`Touches ${plural(code.fileCount, "file")}, ${plural(code.changedLineCount, "changed line")}`}
        />
      )}
    </section>
  )
}

// A few lines the writer chose, with why they're worth the reader's focus.
function ExcerptView({
  guideId,
  excerpt,
  hunksById,
  flags,
}: {
  readonly guideId: GuideId
  readonly excerpt: Excerpt
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
  readonly flags: ReadonlyArray<Flag>
}) {
  const hunk = hunksById.get(excerpt.hunkId)
  if (hunk === undefined) return null
  return (
    <figure className="mt-6" data-testid="excerpt">
      <figcaption className="text-sm text-stone-600">{excerpt.why}</figcaption>
      <HunkView
        guideId={guideId}
        hunk={hunk}
        lines={excerpt.lines}
        flags={flags.filter((flag) => flag.hunkId === hunk.id)}
      />
    </figure>
  )
}

// Flags on lines no excerpt shows: listed so none are hidden, with where to
// find them on the Diff tab.
function FlagsElsewhere({
  flags,
  hunksById,
}: {
  readonly flags: ReadonlyArray<Flag>
  readonly hunksById: ReadonlyMap<HunkId, Hunk>
}) {
  return (
    <div className="mt-6">
      {flags.map((flag) => (
        <div key={`${flag.hunkId}-${flag.line}`}>
          <FlagNote flag={flag} />
          <OpenInDiff
            path={hunksById.get(flag.hunkId)?.path ?? null}
            label={flagLocation(flag, hunksById)}
          />
        </div>
      ))}
    </div>
  )
}

function OpenInDiff({ path, label }: { readonly path: string | null; readonly label: string }) {
  const selectTab = useAtomSet(guideTabAtom)
  const scrollDiffTo = useAtomSet(diffScrollTargetAtom)
  return (
    <p className="mt-4 text-sm text-stone-500">
      {label} ·{" "}
      <button
        className="text-sky-700 hover:underline"
        data-testid="open-in-diff"
        onClick={() => {
          scrollDiffTo(path)
          selectTab("diff")
        }}
      >
        Open in Diff
      </button>
    </p>
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

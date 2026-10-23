import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Guide, GuideId, Hunk } from "@proofroom/protocol"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo } from "react"
import { AgentText } from "../components/AgentText.tsx"
import { MermaidDiagram } from "../components/MermaidDiagram.tsx"
import { StatusBadge } from "../components/StatusBadge.tsx"
import { ChapterView } from "./ChapterView.tsx"
import { RoutineChanges } from "./RoutineChanges.tsx"
import { guideAtom, guideListAtom, hunksAtom } from "./guide-atoms.ts"

// A guide, read top to bottom: what the pull request does, then one chapter per
// idea, then the routine changes. It fills in while the guide is written.
export function GuideView({ guideId }: { readonly guideId: GuideId }) {
  const guide = useAtomValue(guideAtom(guideId))
  const hunks = useAtomValue(hunksAtom(guideId))
  if (!AsyncResult.isSuccess(guide) || !AsyncResult.isSuccess(hunks)) {
    return <div className="p-10 text-stone-500">Loading the guide…</div>
  }
  return <GuideContent guide={guide.value} hunks={hunks.value} />
}

function GuideContent({
  guide,
  hunks,
}: {
  readonly guide: Guide
  readonly hunks: ReadonlyArray<Hunk>
}) {
  const hunksById = useMemo(() => new Map(hunks.map((hunk) => [hunk.id, hunk])), [hunks])
  // The guide list shows each guide's status. It is fetched, not watched, so it
  // is refreshed whenever the open guide moves on.
  const refreshGuideList = useAtomRefresh(guideListAtom)
  useEffect(() => refreshGuideList(), [guide.status, refreshGuideList])
  const { owner, repo, number } = guide.pullRequest
  return (
    <article className="mx-auto max-w-4xl px-10 py-12">
      <header>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <a
            className="hover:underline"
            href={`https://github.com/${owner}/${repo}/pull/${number}`}
          >
            {owner}/{repo}#{number}
          </a>
          <StatusBadge status={guide.status} />
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{guide.title}</h1>
      </header>
      {guide.failure !== null && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {guide.failure}
        </p>
      )}
      {guide.summary === null ? (
        <p className="mt-6 text-stone-500">Reading the pull request…</p>
      ) : (
        <AgentText markdown={guide.summary} className="mt-6 text-lg text-stone-700" />
      )}
      {guide.overviewDiagram !== null && <MermaidDiagram diagram={guide.overviewDiagram} />}
      {guide.chapters.map((chapter) => (
        <ChapterView
          key={chapter.key}
          chapter={chapter}
          placements={guide.placements.filter(
            (placement) =>
              placement.target._tag === "chapter" && placement.target.chapterKey === chapter.key,
          )}
          hunksById={hunksById}
        />
      ))}
      <RoutineChanges placements={guide.placements} hunksById={hunksById} />
    </article>
  )
}

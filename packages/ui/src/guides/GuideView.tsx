import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Guide, GuideId, Hunk } from "@proofroom/protocol"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo } from "react"
import { AgentText } from "../components/AgentText.tsx"
import { MermaidDiagram } from "../components/MermaidDiagram.tsx"
import { StatusBadge } from "../components/StatusBadge.tsx"
import { ReviewBar } from "../reviews/ReviewBar.tsx"
import { ChapterView } from "./ChapterView.tsx"
import { DiffView } from "./DiffView.tsx"
import { RoutineChanges } from "./RoutineChanges.tsx"
import { guideAtom, guideListAtom, guideTabAtom, hunksAtom, type GuideTab } from "./guide-atoms.ts"

// A guide, read top to bottom, or its whole diff on the Diff tab. It fills in
// while the guide is written.
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
  // The guide list shows each guide's status. It is fetched, not watched, so it
  // is refreshed whenever the open guide moves on.
  const refreshGuideList = useAtomRefresh(guideListAtom)
  useEffect(() => refreshGuideList(), [guide.status, refreshGuideList])
  const tab = useAtomValue(guideTabAtom)
  const allFlags = guide.chapters.flatMap((chapter) => chapter.flags)
  return (
    <article className="mx-auto max-w-4xl px-10 py-12">
      <GuideHeader guide={guide} />
      <GuideTabs />
      {tab === "guide" ? (
        <GuideBody guide={guide} hunks={hunks} />
      ) : (
        <DiffView guideId={guide.id} hunks={hunks} flags={allFlags} />
      )}
      <ReviewBar guideId={guide.id} />
    </article>
  )
}

function GuideHeader({ guide }: { readonly guide: Guide }) {
  const { owner, repo, number } = guide.pullRequest
  return (
    <header>
      <div className="flex items-center gap-3 text-sm text-stone-500">
        <a className="hover:underline" href={`https://github.com/${owner}/${repo}/pull/${number}`}>
          {owner}/{repo}#{number}
        </a>
        <StatusBadge status={guide.status} />
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{guide.title}</h1>
      {guide.failure !== null && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {guide.failure}
        </p>
      )}
    </header>
  )
}

function GuideTabs() {
  const tab = useAtomValue(guideTabAtom)
  const selectTab = useAtomSet(guideTabAtom)
  const tabClass = (name: GuideTab) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
      tab === name
        ? "border-stone-900 text-stone-900"
        : "border-transparent text-stone-500 hover:text-stone-700"
    }`
  return (
    <nav className="mt-8 flex gap-6 border-b border-stone-200">
      <button
        data-testid="guide-tab"
        className={tabClass("guide")}
        onClick={() => selectTab("guide")}
      >
        Guide
      </button>
      <button data-testid="diff-tab" className={tabClass("diff")} onClick={() => selectTab("diff")}>
        Diff
      </button>
    </nav>
  )
}

// The guide itself: what the pull request does, one chapter per idea, then the
// routine changes.
function GuideBody({
  guide,
  hunks,
}: {
  readonly guide: Guide
  readonly hunks: ReadonlyArray<Hunk>
}) {
  const hunksById = useMemo(() => new Map(hunks.map((hunk) => [hunk.id, hunk])), [hunks])
  return (
    <>
      {guide.summary === null ? (
        <p className="mt-6 text-stone-500">Reading the pull request…</p>
      ) : (
        <AgentText markdown={guide.summary} className="mt-6 text-lg text-stone-700" />
      )}
      {guide.overviewDiagram !== null && <MermaidDiagram diagram={guide.overviewDiagram} />}
      {guide.chapters.map((chapter) => (
        <ChapterView
          guideId={guide.id}
          key={chapter.key}
          chapter={chapter}
          placements={guide.placements.filter(
            (placement) =>
              placement.target._tag === "chapter" && placement.target.chapterKey === chapter.key,
          )}
          hunksById={hunksById}
        />
      ))}
      <RoutineChanges guideId={guide.id} placements={guide.placements} hunksById={hunksById} />
    </>
  )
}

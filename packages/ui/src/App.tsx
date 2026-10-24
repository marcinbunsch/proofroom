import { useAtomValue } from "@effect/atom-react"
import { GuideList } from "./guides/GuideList.tsx"
import { GuideView } from "./guides/GuideView.tsx"
import { StartGuideForm } from "./guides/StartGuideForm.tsx"
import { selectedGuideIdAtom } from "./guides/guide-atoms.ts"

// The spike's one page: start a guide and pick one on the left, read it on the
// right.
export function App() {
  const selectedGuideId = useAtomValue(selectedGuideIdAtom)
  return (
    <div className="flex h-screen bg-stone-50 font-sans text-stone-900">
      <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-stone-200 bg-white p-5">
        <h1 className="text-lg font-semibold tracking-tight">Proofroom</h1>
        <StartGuideForm />
        <GuideList />
      </aside>
      <main className="flex-1 overflow-y-auto">
        {selectedGuideId === null ? <NoGuideSelected /> : <GuideView guideId={selectedGuideId} />}
      </main>
    </div>
  )
}

function NoGuideSelected() {
  return (
    <div className="flex h-full items-center justify-center text-stone-500">
      Paste a pull request URL to write a guide, or pick one on the left.
    </div>
  )
}

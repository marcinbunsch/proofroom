import { useAtomSet } from "@effect/atom-react"
import { flowNodeId, flowToMermaid, type FlowVisual } from "@proofroom/protocol"
import { useEffect, useMemo, useRef, type MouseEvent } from "react"
import { PeleSvg } from "../components/PeleSvg.tsx"
import { diffScrollTargetAtom, guideTabAtom } from "../guides/guide-atoms.ts"
import { VisualFrame } from "./VisualFrame.tsx"

// A flow through the code, with what changed on it coloured in. A node that
// names its file opens that file on the Diff tab when clicked.
export function FlowView({ visual }: { readonly visual: FlowVisual }) {
  const source = useMemo(() => flowToMermaid(visual), [visual])
  const pathsByNodeId = useMemo(() => linkedPaths(visual), [visual])
  const drawing = useRef<HTMLDivElement>(null)
  const selectTab = useAtomSet(guideTabAtom)
  const scrollDiffTo = useAtomSet(diffScrollTargetAtom)

  // Pele draws plain SVG; the nodes that link somewhere get a pointer here.
  useEffect(() => {
    for (const nodeId of pathsByNodeId.keys()) {
      const node = drawing.current?.querySelector(`[data-id="${nodeId}"]`)
      if (node instanceof SVGElement) node.style.cursor = "pointer"
    }
  }, [source, pathsByNodeId])

  const openClickedNode = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const nodeId = event.target.closest("[data-id]")?.getAttribute("data-id")
    const path = nodeId === undefined || nodeId === null ? undefined : pathsByNodeId.get(nodeId)
    if (path === undefined) return
    scrollDiffTo(path)
    selectTab("diff")
  }

  return (
    <VisualFrame title={visual.title}>
      <div ref={drawing} className="p-4" data-testid="flow" onClick={openClickedNode}>
        <PeleSvg source={source} />
      </div>
      <FlowLegend />
    </VisualFrame>
  )
}

// Mermaid node id -> the file that node links to.
function linkedPaths(visual: FlowVisual): Map<string, string> {
  return new Map(
    visual.nodes.flatMap((node, index) =>
      node.path === null ? [] : [[flowNodeId(index), node.path] as const],
    ),
  )
}

function FlowLegend() {
  return (
    <div className="flex gap-4 border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
      <LegendSwatch className="border-emerald-600 bg-emerald-100" label="added" />
      <LegendSwatch className="border-amber-600 bg-amber-100" label="changed" />
      <LegendSwatch className="border-dashed border-red-600 bg-red-100" label="removed" />
    </div>
  )
}

function LegendSwatch({
  className,
  label,
}: {
  readonly className: string
  readonly label: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-4 rounded-sm border ${className}`} />
      {label}
    </span>
  )
}

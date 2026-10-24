import type { MermaidDiagram as Diagram } from "@proofroom/protocol"
import { PeleSvg } from "./PeleSvg.tsx"

// A free Mermaid diagram from the guide, with its caption.
export function MermaidDiagram({ diagram }: { readonly diagram: Diagram }) {
  return (
    <figure className="my-5 rounded-lg border border-stone-200 bg-white p-4">
      <PeleSvg source={diagram.source} />
      {diagram.caption !== "" && (
        <figcaption className="mt-3 text-center text-sm text-stone-500">
          {diagram.caption}
        </figcaption>
      )}
    </figure>
  )
}

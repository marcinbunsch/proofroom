import type { MermaidDiagram as Diagram } from "@proofroom/protocol"
import { render } from "pele"
import { useMemo } from "react"

// A diagram from the guide, drawn by Pele. The server already drew it once
// when the agent sent it, so it parses; Pele escapes label text, so a label
// can't put markup into the page.
export function MermaidDiagram({ diagram }: { readonly diagram: Diagram }) {
  const svg = useMemo(() => render(diagram.source).svg, [diagram.source])
  return (
    <figure className="my-5 rounded-lg border border-stone-200 bg-white p-4">
      <div
        className="flex justify-center overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {diagram.caption !== "" && (
        <figcaption className="mt-3 text-center text-sm text-stone-500">
          {diagram.caption}
        </figcaption>
      )}
    </figure>
  )
}

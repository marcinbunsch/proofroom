import { render } from "pele"
import { useMemo } from "react"

// Mermaid drawn by Pele, as SVG. The server already drew it once when the
// agent sent it, so it parses; Pele escapes label text, so a label can't put
// markup into the page (tests/mermaid-diagram.test.ts pins that).
export function PeleSvg({ source }: { readonly source: string }) {
  const svg = useMemo(() => render(source).svg, [source])
  return (
    <div
      className="flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

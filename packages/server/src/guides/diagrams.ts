import { ToolRejected, type MermaidDiagram } from "@proofroom/protocol"
import { Effect } from "effect"
import { render } from "pele"

// Every diagram is drawn with Pele the moment an agent sends it. AI-written
// Mermaid often breaks on small things, such as brackets in a label without
// quotes, and Pele says exactly where. That goes back to the agent as the
// tool's error, so a broken diagram never reaches the guide.
export function checkDiagram(diagram: MermaidDiagram | null): Effect.Effect<void, ToolRejected> {
  if (diagram === null) return Effect.void
  return Effect.try({
    try: () => {
      render(diagram.source)
    },
    catch: (error) =>
      new ToolRejected({
        message: [
          "The Mermaid diagram doesn't parse, so nothing was saved.",
          error instanceof Error ? error.message : String(error),
          'Labels with brackets, quotes or punctuation need double quotes, e.g. A["total(prices)"].',
        ].join("\n"),
      }),
  })
}

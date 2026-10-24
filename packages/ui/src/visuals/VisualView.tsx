import type { Visual } from "@proofroom/protocol"
import { MermaidDiagram } from "../components/MermaidDiagram.tsx"
import { ApiChangeView } from "./ApiChangeView.tsx"
import { BehaviourChangeView } from "./BehaviourChangeView.tsx"
import { FlowView } from "./FlowView.tsx"

// One of a chapter's visuals, drawn by the component for its kind.
export function VisualView({ visual }: { readonly visual: Visual }) {
  switch (visual._tag) {
    case "behaviourChange":
      return <BehaviourChangeView visual={visual} />
    case "apiChange":
      return <ApiChangeView visual={visual} />
    case "flow":
      return <FlowView visual={visual} />
    case "diagram":
      return <MermaidDiagram diagram={visual} />
  }
}

import { Schema } from "effect"

// The visuals a chapter can show. The agent fills in data; Proofroom draws it.
// Each kind is made for one thing a reviewer needs to see, so the chapter's
// text can stay short: what used to happen and what happens now, how an API
// changed, how a flow through the code changed. A free Mermaid diagram covers
// the rest.
//
// New kinds are added here, with a renderer in the UI and a check on the
// server.

export const MermaidDiagram = Schema.Struct({
  source: Schema.String,
  caption: Schema.String,
})
export type MermaidDiagram = typeof MermaidDiagram.Type

// Free Mermaid, for what no other kind fits.
export const DiagramVisual = Schema.TaggedStruct("diagram", MermaidDiagram.fields)
export type DiagramVisual = typeof DiagramVisual.Type

// Cases where the code now behaves differently: for each, what happened before
// and what happens now. The clearest way to show a hidden behaviour change.
export const BehaviourCase = Schema.Struct({
  // The input or situation, e.g. "3 items at $9.99 with a 10% coupon".
  situation: Schema.String,
  before: Schema.String,
  after: Schema.String,
})
export type BehaviourCase = typeof BehaviourCase.Type

export const BehaviourChangeVisual = Schema.TaggedStruct("behaviourChange", {
  title: Schema.String,
  cases: Schema.Array(BehaviourCase),
})
export type BehaviourChangeVisual = typeof BehaviourChangeVisual.Type

// Signatures, endpoints, config keys or types that callers see, as they were
// and as they are. `before` is null for something added, `after` for
// something removed.
export const ApiEntry = Schema.Struct({
  before: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
  // Optional: what a caller has to do about it.
  note: Schema.NullOr(Schema.String),
})
export type ApiEntry = typeof ApiEntry.Type

export const ApiChangeVisual = Schema.TaggedStruct("apiChange", {
  title: Schema.String,
  entries: Schema.Array(ApiEntry),
})
export type ApiChangeVisual = typeof ApiChangeVisual.Type

// A path through the code, a request, an event, the data, with what the
// pull request changed on it marked. A node can name the file it lives in,
// so a click opens it on the Diff tab.
export const FlowChange = Schema.Literals(["added", "changed", "removed", "unchanged"])
export type FlowChange = typeof FlowChange.Type

export const FlowNode = Schema.Struct({
  // The agent's own short name for the node, used by edges.
  id: Schema.String,
  label: Schema.String,
  change: FlowChange,
  path: Schema.NullOr(Schema.String),
})
export type FlowNode = typeof FlowNode.Type

export const FlowEdge = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  label: Schema.NullOr(Schema.String),
  change: Schema.Literals(["added", "removed", "unchanged"]),
})
export type FlowEdge = typeof FlowEdge.Type

export const FlowVisual = Schema.TaggedStruct("flow", {
  title: Schema.String,
  direction: Schema.Literals(["across", "down"]),
  nodes: Schema.Array(FlowNode),
  edges: Schema.Array(FlowEdge),
})
export type FlowVisual = typeof FlowVisual.Type

export const Visual = Schema.Union([
  BehaviourChangeVisual,
  ApiChangeVisual,
  FlowVisual,
  DiagramVisual,
])
export type Visual = typeof Visual.Type

// --- drawing a flow ----------------------------------------------------------------

// A flow as Mermaid, which Pele draws. Node ids in the Mermaid are Proofroom's
// own (n0, n1, …), in the order the nodes were given, so nothing the agent
// wrote ends up as Mermaid syntax: labels are quoted, with the characters that
// could end a quoted label written as Mermaid entities.
export function flowToMermaid(flow: FlowVisual): string {
  const mermaidIds = new Map(flow.nodes.map((node, index) => [node.id, flowNodeId(index)]))
  const nodes = flow.nodes.map(
    (node, index) => `  ${flowNodeId(index)}["${mermaidText(node.label)}"]:::${node.change}`,
  )
  const edges = flow.edges.map((edge) => {
    const label = edge.label === null ? "" : `|"${mermaidText(edge.label)}"|`
    return `  ${mermaidIds.get(edge.from)} ${edgeArrows[edge.change]}${label} ${mermaidIds.get(edge.to)}`
  })
  return [
    `flowchart ${flow.direction === "across" ? "LR" : "TD"}`,
    ...nodes,
    ...edges,
    ...flowClasses,
  ].join("\n")
}

// The Mermaid id of the node at `index`, which the drawn SVG carries as its
// data-id, so a click can be traced back to the node.
export function flowNodeId(index: number): string {
  return `n${index}`
}

// Added edges are thick, removed ones dashed.
const edgeArrows: Record<FlowEdge["change"], string> = {
  added: "==>",
  removed: "-.->",
  unchanged: "-->",
}

const flowClasses = [
  "  classDef added fill:#dcfce7,stroke:#16a34a",
  "  classDef changed fill:#fef3c7,stroke:#d97706",
  "  classDef removed fill:#fee2e2,stroke:#dc2626,stroke-dasharray:4 3",
  "  classDef unchanged fill:#ffffff,stroke:#a8a29e",
]

function mermaidText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/`/g, "#96;")
    .trim()
}

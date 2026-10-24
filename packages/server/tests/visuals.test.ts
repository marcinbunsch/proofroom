import { describe, expect, it } from "@effect/vitest"
import { flowToMermaid, type FlowVisual } from "@proofroom/protocol"
import { render } from "pele"

const checkoutFlow: FlowVisual = {
  _tag: "flow",
  title: "Where totals come from",
  direction: "across",
  nodes: [
    { id: "page", label: "Checkout page", change: "unchanged", path: null },
    {
      id: "total",
      label: "cartTotal(prices, discount)",
      change: "changed",
      path: "src/cart/total.ts",
    },
    { id: "legacy", label: "legacyRound", change: "removed", path: null },
  ],
  edges: [
    { from: "page", to: "total", label: "on every change", change: "unchanged" },
    { from: "total", to: "legacy", label: null, change: "removed" },
  ],
}

describe("flowToMermaid", () => {
  it("a flow -> Proofroom's own node ids, a class per change, dashed removed edges", () => {
    expect(flowToMermaid(checkoutFlow).split("\n").slice(0, 6)).toEqual([
      "flowchart LR",
      '  n0["Checkout page"]:::unchanged',
      '  n1["cartTotal(prices, discount)"]:::changed',
      '  n2["legacyRound"]:::removed',
      '  n0 -->|"on every change"| n1',
      "  n1 -.-> n2",
    ])
  })

  // The labels come from an agent; none of it may become Mermaid syntax.
  it("labels that try to close their quotes or add lines -> drawn as text, one node each", () => {
    const hostile: FlowVisual = {
      ...checkoutFlow,
      nodes: [
        { id: "a", label: 'total"] --> x["owned', change: "added", path: null },
        { id: "b", label: "line one\n  click a call alert()", change: "added", path: null },
      ],
      edges: [{ from: "a", to: "b", label: '"|x|', change: "added" }],
    }

    const { svg } = render(flowToMermaid(hostile))

    expect(svg.match(/class="pele-node\b/g)).toHaveLength(2)
    expect(svg).toContain("total&quot;] --&gt; x[&quot;owned")
  })
})

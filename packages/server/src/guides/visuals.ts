import {
  ToolRejected,
  flowToMermaid,
  type ApiChangeVisual,
  type BehaviourChangeVisual,
  type FlowVisual,
  type Visual,
} from "@proofroom/protocol"
import { Effect } from "effect"
import { checkDiagram } from "./diagrams.ts"

// Checks a visual before it is saved, so what reaches the guide always draws
// and stays small enough to take in at a glance. A refusal says what to fix.
//
// `chapterPaths`: the files of the chapter's own hunks, the only ones a flow
// node may link to.
export function checkVisual(
  visual: Visual,
  chapterPaths: ReadonlySet<string>,
): Effect.Effect<void, ToolRejected> {
  switch (visual._tag) {
    case "behaviourChange":
      return refuseIfAny(behaviourChangeProblems(visual))
    case "apiChange":
      return refuseIfAny(apiChangeProblems(visual))
    case "flow":
      return refuseIfAny(flowProblems(visual, chapterPaths)).pipe(
        // Proofroom writes the flow's Mermaid itself; drawing it once more
        // catches anything that still wouldn't parse.
        Effect.andThen(checkDiagram({ source: flowToMermaid(visual), caption: visual.title })),
      )
    case "diagram":
      return checkDiagram(visual)
  }
}

// --- the kinds ---------------------------------------------------------------------

// A visual is read at a glance; past these sizes it is a table to study.
const maxBehaviourCases = 8
const maxApiEntries = 12
const minFlowNodes = 2
const maxFlowNodes = 15

function behaviourChangeProblems(visual: BehaviourChangeVisual): Array<string> {
  return [
    ...countProblems(["case", "cases"], visual.cases.length, 1, maxBehaviourCases),
    ...visual.cases.flatMap((behaviourCase, index) =>
      behaviourCase.before.trim() === behaviourCase.after.trim()
        ? [`Case ${index + 1} is the same before and after; show only what changed.`]
        : [],
    ),
  ]
}

function apiChangeProblems(visual: ApiChangeVisual): Array<string> {
  return [
    ...countProblems(["entry", "entries"], visual.entries.length, 1, maxApiEntries),
    ...visual.entries.flatMap((entry, index) =>
      entry.before === null && entry.after === null
        ? [`Entry ${index + 1} has neither a before nor an after.`]
        : [],
    ),
  ]
}

function flowProblems(visual: FlowVisual, chapterPaths: ReadonlySet<string>): Array<string> {
  const nodeIds = new Set(visual.nodes.map((node) => node.id))
  return [
    ...countProblems(["node", "nodes"], visual.nodes.length, minFlowNodes, maxFlowNodes),
    ...(nodeIds.size < visual.nodes.length ? ["Two nodes share an id; give each its own."] : []),
    ...visual.edges.flatMap((edge) =>
      [edge.from, edge.to]
        .filter((end) => !nodeIds.has(end))
        .map((end) => `An edge names "${end}", which is not one of the nodes' ids.`),
    ),
    ...visual.nodes.flatMap((node) =>
      node.path !== null && !chapterPaths.has(node.path)
        ? [
            `Node "${node.id}" links to ${node.path}, which isn't one of this chapter's files: ${[...chapterPaths].join(", ")}. Use one of those, or null.`,
          ]
        : [],
    ),
  ]
}

// --- helpers -----------------------------------------------------------------------

function countProblems(
  [one, many]: readonly [string, string],
  count: number,
  min: number,
  max: number,
): Array<string> {
  if (count < min) return [`Give at least ${min} ${min === 1 ? one : many}.`]
  if (count > max) return [`Give at most ${max} ${many}; keep the ones that matter most.`]
  return []
}

function refuseIfAny(problems: ReadonlyArray<string>): Effect.Effect<void, ToolRejected> {
  if (problems.length === 0) return Effect.void
  return Effect.fail(new ToolRejected({ message: ["Nothing was saved.", ...problems].join("\n") }))
}

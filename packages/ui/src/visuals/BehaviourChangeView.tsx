import type { BehaviourChangeVisual } from "@proofroom/protocol"
import { VisualFrame } from "./VisualFrame.tsx"

// Each case on a row: the situation, then what used to happen and what happens
// now, side by side, so the difference is read across rather than worked out.
export function BehaviourChangeView({ visual }: { readonly visual: BehaviourChangeVisual }) {
  return (
    <VisualFrame title={visual.title}>
      <table className="w-full text-sm" data-testid="behaviour-change">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Before</th>
            <th className="px-4 py-2 font-medium">Now</th>
          </tr>
        </thead>
        <tbody>
          {visual.cases.map((behaviourCase, index) => (
            <tr key={index} className="border-t border-stone-100 align-top">
              <td className="px-4 py-2 text-stone-800">{behaviourCase.situation}</td>
              <td className="bg-red-50/60 px-4 py-2 font-mono text-[13px] text-red-900">
                {behaviourCase.before}
              </td>
              <td className="bg-emerald-50/60 px-4 py-2 font-mono text-[13px] text-emerald-900">
                {behaviourCase.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </VisualFrame>
  )
}

import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GuideId, GuideNotFound, ReviewVerdict, SubmitFailed } from "@proofroom/protocol"
import { Cause, Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { RpcClientError } from "effect/rpc"
import { useState } from "react"
import { draftsAtom, draftsChanged, submitReviewAtom } from "./review-atoms.ts"

// Submitting the review, pinned to the bottom of the guide: how many draft
// comments are waiting, a summary, a verdict, and the button that sends them
// all to GitHub as one review.
//
// The summary and verdict being chosen, and the last outcome, are kept in the
// component: they matter only until the review is sent.
export function ReviewBar({ guideId }: { readonly guideId: GuideId }) {
  const drafts = useAtomValue(draftsAtom(guideId))
  const submitReview = useAtomSet(submitReviewAtom, { mode: "promiseExit" })
  const [summary, setSummary] = useState("")
  const [verdict, setVerdict] = useState<ReviewVerdict>("comment")
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const draftCount = AsyncResult.isSuccess(drafts) ? drafts.value.length : 0

  const submit = async () => {
    setIsSubmitting(true)
    const exit = await submitReview({
      payload: { guideId, verdict, summary },
      reactivityKeys: [draftsChanged(guideId)],
    })
    setIsSubmitting(false)
    if (Exit.isSuccess(exit)) {
      setOutcome({ _tag: "submitted", reviewUrl: exit.value })
      setSummary("")
    } else {
      setOutcome({ _tag: "failed", reason: reasonFor(exit.cause) })
    }
  }

  return (
    <div
      className="sticky bottom-0 mt-16 border-t border-stone-200 bg-stone-50/95 py-4 backdrop-blur"
      data-testid="review-bar"
    >
      <div className="flex items-start gap-3">
        <textarea
          data-testid="review-summary"
          className="min-h-10 flex-1 resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
          placeholder="Summary of your review"
          rows={1}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <select
          data-testid="review-verdict"
          className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
          value={verdict}
          onChange={(event) => setVerdict(verdictFrom(event.target.value))}
        >
          <option value="comment">Comment</option>
          <option value="approve">Approve</option>
          <option value="request-changes">Request changes</option>
        </select>
        <button
          data-testid="submit-review"
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          disabled={isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? "Sending…" : submitLabel(draftCount)}
        </button>
      </div>
      {outcome?._tag === "submitted" && (
        <p className="mt-2 text-sm text-emerald-800">
          Review sent.{" "}
          <a className="underline" href={outcome.reviewUrl}>
            See it on GitHub
          </a>
        </p>
      )}
      {outcome?._tag === "failed" && <p className="mt-2 text-sm text-red-700">{outcome.reason}</p>}
    </div>
  )
}

type Outcome =
  | { readonly _tag: "submitted"; readonly reviewUrl: string }
  | { readonly _tag: "failed"; readonly reason: string }

function submitLabel(draftCount: number): string {
  if (draftCount === 0) return "Submit review"
  return `Submit review · ${draftCount} ${draftCount === 1 ? "comment" : "comments"}`
}

function verdictFrom(value: string): ReviewVerdict {
  if (value === "approve" || value === "request-changes") return value
  return "comment"
}

// The server's own reason when it gave one (a missing summary, GitHub refusing
// the review), which is written to be shown as is.
function reasonFor(
  cause: Cause.Cause<GuideNotFound | SubmitFailed | RpcClientError.RpcClientError>,
): string {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error) && error.value._tag === "SubmitFailed") return error.value.message
  return "Couldn't send the review. Is the server running?"
}

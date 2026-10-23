import { useAtomSet } from "@effect/atom-react"
import type { AgentCli, GenerateFailed } from "@proofroom/protocol"
import { Cause, Exit, Option } from "effect"
import type { RpcClientError } from "effect/rpc"
import { useState, type FormEvent } from "react"
import { selectedGuideIdAtom, startGuideAtom } from "./guide-atoms.ts"

// Starts a guide for a pull request URL, then shows it while it is written.
//
// The URL and CLI being typed are the only state kept in the component: they
// matter only until the form is sent.
export function StartGuideForm() {
  const [pullRequestUrl, setPullRequestUrl] = useState("")
  const [cli, setCli] = useState<AgentCli>("claude")
  const [failure, setFailure] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const startGuide = useAtomSet(startGuideAtom, { mode: "promiseExit" })
  const selectGuide = useAtomSet(selectedGuideIdAtom)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsStarting(true)
    setFailure(null)
    const exit = await startGuide({ payload: { pullRequestUrl, cli }, reactivityKeys: ["guides"] })
    setIsStarting(false)
    if (Exit.isSuccess(exit)) {
      selectGuide(exit.value)
      setPullRequestUrl("")
    } else {
      setFailure(reasonFor(exit.cause))
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-stone-700" htmlFor="pull-request-url">
        Pull request
      </label>
      <input
        id="pull-request-url"
        data-testid="pull-request-url"
        className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        placeholder="https://github.com/owner/repo/pull/123"
        value={pullRequestUrl}
        onChange={(event) => setPullRequestUrl(event.target.value)}
      />
      <div className="flex gap-2">
        <select
          className="rounded-md border border-stone-300 px-2 py-2 text-sm"
          value={cli}
          onChange={(event) => setCli(event.target.value === "codex" ? "codex" : "claude")}
        >
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
        <button
          type="submit"
          data-testid="start-guide"
          disabled={isStarting || pullRequestUrl.trim() === ""}
          className="flex-1 rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isStarting ? "Fetching…" : "Write guide"}
        </button>
      </div>
      {failure !== null && <p className="text-sm text-red-700">{failure}</p>}
    </form>
  )
}

// The server's own reason when it gave one ("… is not a GitHub pull request
// URL"), which is written to be shown as is.
function reasonFor(cause: Cause.Cause<GenerateFailed | RpcClientError.RpcClientError>): string {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error) && error.value._tag === "GenerateFailed") return error.value.message
  return "Couldn't reach the server. Is it running?"
}

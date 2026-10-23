import { Context } from "effect"

// Where the agent CLIs are. Whatever `claude` and `codex` the user's PATH
// finds, unless a test points them at stand-in scripts.
export const AgentExecutables = Context.Reference<{
  readonly claude: string
  readonly codex: string
}>("proofroom/agents/AgentExecutables", {
  defaultValue: () => ({ claude: "claude", codex: "codex" }),
})

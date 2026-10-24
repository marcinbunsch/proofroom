import { ChildProcessSpawner } from "effect/process"
import { runCommand } from "../process/run-command.ts"

// Runs git the one way Proofroom runs it: with the user's own git setup left
// out, so it prints what Proofroom expects and never stops to prompt.
export function runGit(
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  args: ReadonlyArray<string>,
  cwd: string | undefined,
) {
  return runCommand(spawner, {
    executable: "git",
    args: [...hermeticConfig, ...args],
    cwd,
    env: hermeticEnvironment,
  })
}

// The user's global and system git config are ignored. Settings like
// `diff.noprefix`, an external diff tool or a credential helper would
// otherwise change what git prints, or make it prompt.
const hermeticEnvironment = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
}

const hermeticConfig = ["-c", "core.quotePath=false", "-c", "advice.detachedHead=false"]

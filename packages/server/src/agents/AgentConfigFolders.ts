import { homedir } from "node:os"
import { join } from "node:path"
import { Config, Context, Effect, Layer, Option } from "effect"

// Which account each agent CLI runs as: the folder that holds its login and
// settings. Set CLAUDE_CONFIG_DIR or CODEX_HOME in Proofroom's environment (or
// the repo's .env) to run guides as another account, such as a work one.

export interface ConfigFolders {
  // null: Claude Code's own default, ~/.claude.
  readonly claudeConfigDir: string | null
  // Always a real path: Codex runs with an empty home folder (see
  // codex-cli.ts), so it can't find its default ~/.codex on its own.
  readonly codexHome: string
}

export class AgentConfigFolders extends Context.Service<AgentConfigFolders, ConfigFolders>()(
  "proofroom/agents/AgentConfigFolders",
) {
  static readonly layer = Layer.effect(AgentConfigFolders, readConfigFolders())
}

// A function declaration, so the layer above can use it before this line.
function readConfigFolders() {
  return Effect.gen(function* () {
    const claudeConfigDir = yield* readFolder("CLAUDE_CONFIG_DIR")
    const codexHome = yield* readFolder("CODEX_HOME")
    return AgentConfigFolders.of({
      claudeConfigDir: Option.getOrNull(claudeConfigDir),
      codexHome: Option.getOrElse(codexHome, () => join(homedir(), ".codex")),
    })
  })
}

// An empty value counts as unset: a variable exported as "" should mean "use
// the default", not "a folder with no name".
function readFolder(name: string) {
  return Config.option(Config.String(name)).pipe(
    Config.map(Option.filter((folder) => folder.trim() !== "")),
  )
}

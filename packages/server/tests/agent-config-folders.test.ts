import { assert, describe, it } from "@effect/vitest"
import { homedir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect } from "effect"
import { AgentConfigFolders } from "../src/agents/AgentConfigFolders.ts"

// Reads the folders from the given environment, as the app would from its own.
function readFolders(environment: Record<string, string>) {
  return Effect.gen(function* () {
    return yield* AgentConfigFolders
  }).pipe(
    Effect.provide(AgentConfigFolders.layer),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(environment))),
  )
}

describe("AgentConfigFolders", () => {
  it.effect("both set -> guides run as those accounts", () =>
    Effect.gen(function* () {
      const folders = yield* readFolders({
        CLAUDE_CONFIG_DIR: "/Users/ada/.claude-work",
        CODEX_HOME: "/Users/ada/.codex-work",
      })
      assert.deepStrictEqual(folders, {
        claudeConfigDir: "/Users/ada/.claude-work",
        codexHome: "/Users/ada/.codex-work",
      })
    }),
  )

  it.effect("neither set -> each CLI's default account", () =>
    Effect.gen(function* () {
      const folders = yield* readFolders({})
      assert.deepStrictEqual(folders, {
        claudeConfigDir: null,
        codexHome: join(homedir(), ".codex"),
      })
    }),
  )

  it.effect("set but empty -> treated as unset, not as a folder with no name", () =>
    Effect.gen(function* () {
      const folders = yield* readFolders({ CLAUDE_CONFIG_DIR: "", CODEX_HOME: "  " })
      assert.deepStrictEqual(folders, {
        claudeConfigDir: null,
        codexHome: join(homedir(), ".codex"),
      })
    }),
  )
})

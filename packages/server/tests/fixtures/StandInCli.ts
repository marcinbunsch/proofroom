import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// A shell script standing in for `claude` or `codex`. It records how it was
// started (arguments, stdin, working folder, and the folders it was told to
// use), prints the output it was given, and exits with the given code.

export interface RecordedStart {
  readonly args: Array<string>
  readonly stdin: string
  readonly workingDirectory: string
  readonly home: string
  readonly claudeConfigDir: string
  readonly codexHome: string
}

export class StandInCli {
  private constructor(
    readonly executable: string,
    private readonly recordFolder: string,
  ) {}

  static create(
    folder: string,
    options: { readonly output: string; readonly exitCode?: number },
  ): StandInCli {
    const recordFolder = join(folder, "record")
    mkdirSync(recordFolder, { recursive: true })
    writeFileSync(join(recordFolder, "output"), options.output)
    const executable = join(folder, "agent-cli")
    writeFileSync(
      executable,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$@" > "${recordFolder}/args"`,
        `cat > "${recordFolder}/stdin"`,
        `pwd -P > "${recordFolder}/cwd"`,
        `printf '%s' "$HOME" > "${recordFolder}/home"`,
        `printf '%s' "$CLAUDE_CONFIG_DIR" > "${recordFolder}/claude-config-dir"`,
        `printf '%s' "$CODEX_HOME" > "${recordFolder}/codex-home"`,
        `cat "${recordFolder}/output"`,
        `exit ${options.exitCode ?? 0}`,
        "",
      ].join("\n"),
    )
    chmodSync(executable, 0o755)
    return new StandInCli(executable, recordFolder)
  }

  recordedStart(): RecordedStart {
    const read = (file: string) => readFileSync(join(this.recordFolder, file), "utf8")
    return {
      args: read("args").split("\n").slice(0, -1),
      stdin: read("stdin"),
      workingDirectory: read("cwd").trim(),
      home: read("home"),
      claudeConfigDir: read("claude-config-dir"),
      codexHome: read("codex-home"),
    }
  }
}

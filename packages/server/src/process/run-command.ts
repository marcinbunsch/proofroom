import { Effect, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

// Runs a command to completion and returns what it printed. A non-zero exit
// fails with CommandFailed, which carries everything the command printed, so
// callers can say why git or gh refused. Every failure is also logged in full,
// so it can be debugged from the log alone.
//
// The spawner is passed in rather than read from the context, so a service
// that runs commands takes it once when it is built and its methods need
// nothing more.

export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: Schema.String,
  exitCode: Schema.Int,
  stderr: Schema.String,
  // Some tools explain a failure on stdout: `gh api` prints GitHub's error
  // response there and only "HTTP 422" on stderr.
  stdout: Schema.String,
  message: Schema.String,
}) {}

export interface Command {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string | undefined
  // Added on top of Proofroom's own environment.
  readonly env?: Record<string, string> | undefined
  // Written to the command's stdin, which is then closed. Long input, such as
  // an agent prompt for a big pull request, goes here rather than in the
  // arguments, which the operating system caps in size.
  readonly stdin?: string | undefined
}

export function runCommand(
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: Command,
) {
  return Effect.gen(function* () {
    const handle = yield* spawner.spawn(
      ChildProcess.make(command.executable, command.args, {
        cwd: command.cwd,
        env: command.env,
        extendEnv: true,
        stdin: stdinFrom(command.stdin),
      }),
    )
    // Both outputs are read at the same time: a command that fills its stderr
    // while only stdout is being read would wait forever.
    const [stdout, stderr] = yield* Effect.all([readText(handle.stdout), readText(handle.stderr)], {
      concurrency: 2,
    })
    const exitCode = yield* handle.exitCode
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      yield* logFailure(command, exitCode, stdout, stderr)
      return yield* commandFailed(command, exitCode, stdout, stderr)
    }
    return stdout
  }).pipe(Effect.scoped)
}

function stdinFrom(text: string | undefined) {
  if (text === undefined) return "ignore"
  return Stream.make(new TextEncoder().encode(text))
}

function readText<E>(bytes: Stream.Stream<Uint8Array, E>) {
  return bytes.pipe(Stream.decodeText(), Stream.mkString)
}

// The message shows the start of the command and of what it said: enough to
// see what failed without pasting a whole prompt or diff into it.
function commandFailed(command: Command, exitCode: number, stdout: string, stderr: string) {
  const commandLine = [command.executable, ...command.args.slice(0, 4)].join(" ")
  return new CommandFailed({
    command: commandLine,
    exitCode,
    stderr,
    stdout,
    message: `${commandLine} exited with ${exitCode}: ${stderr.trim().slice(0, 2_000)}`,
  })
}

// 4,000 characters of each output: a full gh or git error and then some,
// without a whole diff landing in the log. stdin (often an agent prompt) is
// logged by size only.
const loggedOutputLength = 4_000

function logFailure(command: Command, exitCode: number, stdout: string, stderr: string) {
  return Effect.logError("command failed", {
    executable: command.executable,
    args: command.args.map((arg) => arg.slice(0, 300)),
    cwd: command.cwd,
    exitCode,
    stderr: stderr.slice(-loggedOutputLength),
    stdout: stdout.slice(-loggedOutputLength),
    stdinLength: command.stdin?.length ?? 0,
  })
}

import { Effect, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

// Runs a command to completion and returns what it printed. A non-zero exit
// fails with CommandFailed, which carries the command's stderr, so callers can
// say why git or gh refused.
//
// The spawner is passed in rather than read from the context, so a service
// that runs commands takes it once when it is built and its methods need
// nothing more.

export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: Schema.String,
  exitCode: Schema.Int,
  stderr: Schema.String,
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
      return yield* commandFailed(command, exitCode, stderr)
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

// The message shows the start of the command and of stderr: enough to see
// what failed without pasting a whole prompt or diff into a log line.
function commandFailed(command: Command, exitCode: number, stderr: string) {
  const commandLine = [command.executable, ...command.args.slice(0, 4)].join(" ")
  return new CommandFailed({
    command: commandLine,
    exitCode,
    stderr,
    message: `${commandLine} exited with ${exitCode}: ${stderr.trim().slice(0, 2_000)}`,
  })
}

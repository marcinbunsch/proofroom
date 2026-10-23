import { homedir } from "node:os"
import { join } from "node:path"
import { Config, Context, Effect, Layer } from "effect"

// Everything Proofroom keeps on disk lives under one folder: the database, its
// own clones of the listed repositories, and the short-lived worktrees agent
// runs read from. Nothing is written inside the user's own checkouts.
export class AppPaths extends Context.Service<
  AppPaths,
  {
    readonly home: string
    readonly database: string
    readonly repositories: string
    readonly worktrees: string
  }
>()("proofroom/AppPaths") {
  static readonly fromHome = (home: string) =>
    Layer.succeed(
      AppPaths,
      AppPaths.of({
        home,
        database: join(home, "proofroom.db"),
        repositories: join(home, "repos"),
        worktrees: join(home, "worktrees"),
      }),
    )

  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const home = yield* Config.String("PROOFROOM_HOME").pipe(
        Config.withDefault(join(homedir(), ".proofroom")),
      )
      return AppPaths.fromHome(home)
    }),
  )
}

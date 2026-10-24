import { homedir } from "node:os"
import { join } from "node:path"
import { Config, Context, Effect, Layer } from "effect"

// Everything Proofroom keeps on disk lives under one folder, by default
// ~/.proofroom. Nothing is ever written inside the user's own checkouts.

export interface Paths {
  readonly home: string
  readonly database: string
  // Proofroom's own clones of the repositories it reviews.
  readonly repositories: string
  // Short-lived checkouts that agent runs read from.
  readonly worktrees: string
  // An empty folder that agent CLIs get as their home folder, so they don't
  // load the user's personal skills and settings into a guide run.
  readonly agentHome: string
}

export class AppPaths extends Context.Service<AppPaths, Paths>()("proofroom/AppPaths") {
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const home = yield* Config.String("PROOFROOM_HOME").pipe(
        Config.withDefault(join(homedir(), ".proofroom")),
      )
      return AppPaths.fromHome(home)
    }),
  )

  // A function, unlike service layers: AppPaths holds no state, so building it
  // more than once is harmless.
  static fromHome(home: string) {
    return Layer.succeed(
      AppPaths,
      AppPaths.of({
        home,
        database: join(home, "proofroom.db"),
        repositories: join(home, "repos"),
        worktrees: join(home, "worktrees"),
        agentHome: join(home, "agent-home"),
      }),
    )
  }
}

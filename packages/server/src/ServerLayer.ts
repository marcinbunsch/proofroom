import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { AppPaths } from "./AppPaths.ts"
import { AgentRunnerService } from "./agents/AgentRunnerService.ts"
import { GuideGenerationService } from "./guides/GuideGenerationService.ts"
import { GitHubService } from "./pull-requests/GitHubService.ts"
import { StorageLive } from "./storage/StorageLayer.ts"

// The whole server, put together in one place: writing guides, storing them,
// and everything they need from outside (git and gh, the agent CLIs, the
// home folder). main.ts serves it to the UI; the generate-guide script uses it
// directly.
//
// Storage is merged into the output, so the RPC handlers read and watch guides
// through the same storage the guide writer saves to.
export const ServerLive = GuideGenerationService.layer.pipe(
  Layer.provideMerge(StorageLive),
  Layer.provide(AgentRunnerService.layer),
  Layer.provide(GitHubService.layer),
  Layer.provide(AppPaths.layer),
  Layer.provide(NodeServices.layer),
)

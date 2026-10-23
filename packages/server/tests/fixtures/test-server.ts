import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { AppPaths } from "../../src/AppPaths.ts"
import { GuideGenerationService } from "../../src/guides/GuideGenerationService.ts"
import { GitRemoteUrl } from "../../src/pull-requests/GitRemoteUrl.ts"
import { makeStorageLayer } from "../../src/storage/StorageLayer.ts"
import { createCheckoutOrigin, fakeGitHub } from "./checkout-origin.ts"
import { fakeAgentRunner, type AgentScripts } from "./FakeAgentRunner.ts"

// The server built the way ServerLayer.ts builds it, with real git, real
// storage and real tool servers. Only GitHub and the agent are stand-ins: a
// fake gh, an origin repository for pull request 482 inside `workspace`, and
// the scripted agents given.
export function makeTestServerLayer(workspace: string, scripts: AgentScripts) {
  const { origin } = createCheckoutOrigin(join(workspace, "origin"))
  return GuideGenerationService.layer.pipe(
    Layer.provideMerge(makeStorageLayer(":memory:")),
    Layer.provide(fakeAgentRunner(scripts)),
    Layer.provide(fakeGitHub),
    Layer.provide(Layer.succeed(GitRemoteUrl, () => origin.path)),
    Layer.provide(AppPaths.fromHome(join(workspace, "home"))),
    Layer.provide(NodeServices.layer),
  )
}

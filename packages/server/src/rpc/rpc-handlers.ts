import { GenerateFailed, ProofroomRpcs } from "@proofroom/protocol"
import { Effect } from "effect"
import { GuideGenerationService } from "../guides/GuideGenerationService.ts"
import { GuideQueryService } from "../storage/guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "../storage/guides/GuideSubscriptionService.ts"

// What the UI can ask the server: one handler per procedure in ProofroomRpcs,
// each a thin call into the guide services.
export const RpcHandlersLive = ProofroomRpcs.toLayer(
  Effect.gen(function* () {
    const generation = yield* GuideGenerationService
    const queries = yield* GuideQueryService
    const subscriptions = yield* GuideSubscriptionService

    return {
      // Every way loading the pull request can fail reaches the UI as one
      // message it can show as is.
      generateGuide: ({ pullRequestUrl, cli }) =>
        generation
          .start(pullRequestUrl, cli)
          .pipe(Effect.mapError((error) => new GenerateFailed({ message: error.message }))),
      listGuides: () => queries.listGuides,
      watchGuide: ({ guideId }) => subscriptions.watchGuide(guideId),
      getHunks: ({ guideId }) => queries.loadHunks(guideId),
    }
  }),
)

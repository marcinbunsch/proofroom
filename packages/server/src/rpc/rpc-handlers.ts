import { GenerateFailed, ProofroomRpcs } from "@proofroom/protocol"
import { Effect } from "effect"
import { GuideGenerationService } from "../guides/GuideGenerationService.ts"
import { GuideQueryService } from "../storage/guides/GuideQueryService.ts"
import { ReviewService } from "../reviews/ReviewService.ts"
import { GuideSubscriptionService } from "../storage/guides/GuideSubscriptionService.ts"
import { DraftMutationService } from "../storage/reviews/DraftMutationService.ts"
import { DraftQueryService } from "../storage/reviews/DraftQueryService.ts"

// What the UI can ask the server: one handler per procedure in ProofroomRpcs,
// each a thin call into the guide services.
export const RpcHandlersLive = ProofroomRpcs.toLayer(
  Effect.gen(function* () {
    const generation = yield* GuideGenerationService
    const queries = yield* GuideQueryService
    const subscriptions = yield* GuideSubscriptionService
    const reviews = yield* ReviewService
    const drafts = yield* DraftQueryService
    const draftMutations = yield* DraftMutationService

    return {
      // Every way loading the pull request can fail reaches the UI as one
      // message it can show as is.
      generateGuide: ({ pullRequestUrl, cli }) =>
        generation
          .start(pullRequestUrl, cli)
          .pipe(Effect.mapError((error) => new GenerateFailed({ message: error.message }))),
      listGuides: () => queries.listGuides,
      watchGuide: ({ guideId }) => subscriptions.watchGuide(guideId),
      deleteGuide: ({ guideId }) => generation.delete(guideId),
      getHunks: ({ guideId }) => queries.loadHunks(guideId),

      listDraftComments: ({ guideId }) => drafts.listDrafts(guideId),
      addDraftComment: ({ guideId, anchor, body }) => reviews.addDraft(guideId, anchor, body),
      updateDraftComment: ({ draftCommentId, body }) =>
        draftMutations.updateDraft(draftCommentId, body),
      deleteDraftComment: ({ draftCommentId }) => draftMutations.deleteDraft(draftCommentId),
      submitReview: ({ guideId, verdict, summary }) => reviews.submit(guideId, verdict, summary),
    }
  }),
)

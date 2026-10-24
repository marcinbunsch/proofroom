import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AgentCli, Guide, GuideId, GuideSummary } from "./guide.ts"
import { Hunk } from "./hunk.ts"
import {
  CommentAnchor,
  DraftComment,
  DraftCommentId,
  DraftCommentNotFound,
  ReviewVerdict,
  SubmitFailed,
} from "./review.ts"

export class GuideNotFound extends Schema.TaggedError<GuideNotFound>()("GuideNotFound", {
  guideId: GuideId,
}) {}

export class GenerateFailed extends Schema.TaggedError<GenerateFailed>()("GenerateFailed", {
  message: Schema.String,
}) {}

export class ProofroomRpcs extends RpcGroup.make(
  // --- guides ------------------------------------------------------------------

  // Starts a guide and returns straight away. The guide is written in the
  // background; watch it with watchGuide.
  Rpc.make("generateGuide", {
    payload: Schema.Struct({ pullRequestUrl: Schema.String, cli: AgentCli }),
    success: GuideId,
    error: GenerateFailed,
  }),
  Rpc.make("listGuides", {
    success: Schema.Array(GuideSummary),
  }),
  // The current guide, then the whole guide again every time it changes.
  Rpc.make("watchGuide", {
    payload: Schema.Struct({ guideId: GuideId }),
    success: Guide,
    error: GuideNotFound,
    stream: true,
  }),
  // Deletes the guide with its draft comments, stopping it first if it is
  // still being written. Nothing on GitHub changes.
  Rpc.make("deleteGuide", {
    payload: Schema.Struct({ guideId: GuideId }),
  }),
  Rpc.make("getHunks", {
    payload: Schema.Struct({ guideId: GuideId }),
    success: Schema.Array(Hunk),
    error: GuideNotFound,
  }),

  // --- reviewing ---------------------------------------------------------------

  Rpc.make("listDraftComments", {
    payload: Schema.Struct({ guideId: GuideId }),
    success: Schema.Array(DraftComment),
  }),
  Rpc.make("addDraftComment", {
    payload: Schema.Struct({ guideId: GuideId, anchor: CommentAnchor, body: Schema.String }),
    success: DraftComment,
    error: GuideNotFound,
  }),
  Rpc.make("updateDraftComment", {
    payload: Schema.Struct({ draftCommentId: DraftCommentId, body: Schema.String }),
    success: DraftComment,
    error: DraftCommentNotFound,
  }),
  Rpc.make("deleteDraftComment", {
    payload: Schema.Struct({ draftCommentId: DraftCommentId }),
  }),
  // Sends the summary, the verdict and every draft comment of the guide to
  // GitHub as one review, then clears the drafts. Returns the review's URL.
  Rpc.make("submitReview", {
    payload: Schema.Struct({ guideId: GuideId, verdict: ReviewVerdict, summary: Schema.String }),
    success: Schema.String,
    error: Schema.Union([GuideNotFound, SubmitFailed]),
  }),
) {}

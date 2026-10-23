import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AgentCli, Guide, GuideId, GuideSummary } from "./guide.ts"
import { Hunk } from "./hunk.ts"

export class GuideNotFound extends Schema.TaggedError<GuideNotFound>()("GuideNotFound", {
  guideId: GuideId,
}) {}

export class GenerateFailed extends Schema.TaggedError<GenerateFailed>()("GenerateFailed", {
  message: Schema.String,
}) {}

export class ProofroomRpcs extends RpcGroup.make(
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
  Rpc.make("getHunks", {
    payload: Schema.Struct({ guideId: GuideId }),
    success: Schema.Array(Hunk),
    error: GuideNotFound,
  }),
) {}

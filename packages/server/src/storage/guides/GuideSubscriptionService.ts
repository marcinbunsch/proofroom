import type { Guide, GuideId, GuideNotFound } from "@proofroom/protocol"
import { Context, Effect, Layer, PubSub, Stream } from "effect"
import { GuideQueryService } from "./GuideQueryService.ts"

// Watching a guide as it is written: the subscriptions, in GraphQL terms.
//
// GuideMutationService announces every change it makes. A watcher is told only
// which guide changed, then loads the guide again through GuideQueryService, so
// it always sees a whole guide straight from the database, never half a change.

export interface GuideSubscriptions {
  // The guide as it is now, then again after every change to it, for as long
  // as the stream is consumed. Two quick changes may arrive as one version;
  // the last version is always the latest guide.
  readonly watchGuide: (guideId: GuideId) => Stream.Stream<Guide, GuideNotFound>
  // Called by GuideMutationService after each write.
  readonly announceChange: (guideId: GuideId) => Effect.Effect<void>
}

export class GuideSubscriptionService extends Context.Service<
  GuideSubscriptionService,
  GuideSubscriptions
>()("proofroom/storage/guides/GuideSubscriptionService") {
  // Needs only the database from outside; the query service it reloads
  // through is provided here.
  static readonly layer = Layer.effect(
    GuideSubscriptionService,
    makeGuideSubscriptionService(),
  ).pipe(Layer.provide(GuideQueryService.layer))
}

// A function declaration, so the layer above can use it before this line.
function makeGuideSubscriptionService() {
  return Effect.gen(function* () {
    const queries = yield* GuideQueryService
    const changedGuides = yield* PubSub.unbounded<GuideId>()
    yield* Effect.addFinalizer(() => PubSub.shutdown(changedGuides))

    const watchGuide = (guideId: GuideId) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before the first load, so a change that lands in
          // between is not missed.
          const subscription = yield* PubSub.subscribe(changedGuides)
          const changesToThisGuide = Stream.fromSubscription(subscription).pipe(
            Stream.filter((changedGuideId) => changedGuideId === guideId),
          )
          const guideNow = Stream.fromEffect(queries.loadGuide(guideId))
          const guideAfterEachChange = changesToThisGuide.pipe(
            Stream.mapEffect(() => queries.loadGuide(guideId)),
          )
          return Stream.concat(guideNow, guideAfterEachChange)
        }),
      )

    const announceChange = (guideId: GuideId) =>
      PubSub.publish(changedGuides, guideId).pipe(Effect.asVoid)

    return GuideSubscriptionService.of({ watchGuide, announceChange })
  })
}

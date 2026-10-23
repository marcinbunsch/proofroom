import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Effect, Layer } from "effect"
import { AppPaths } from "../AppPaths.ts"
import { GuideMutationService } from "./guides/GuideMutationService.ts"
import { GuideQueryService } from "./guides/GuideQueryService.ts"
import { GuideSubscriptionService } from "./guides/GuideSubscriptionService.ts"
import { databaseLayer } from "./migrations.ts"

// The one place storage is put together. The app and the tests both build
// storage through makeStorageLayer, so the tests check the same wiring the app
// runs with.
//
// Each service's layer brings the services it depends on (subscriptions bring
// queries, mutations bring subscriptions). That works because Effect builds a
// layer once per layer object and shares it. So service layers must stay plain
// values: a layer made by calling a function is a new object every time, and
// would be built twice. For GuideSubscriptionService that would mean mutations
// announcing to one copy while the UI watches another.

export function makeStorageLayer(databaseFile: string) {
  return Layer.mergeAll(
    GuideQueryService.layer,
    GuideSubscriptionService.layer,
    GuideMutationService.layer,
  ).pipe(Layer.provide(databaseLayer(databaseFile)))
}

// Storage in Proofroom's home folder, for the running app.
export const StorageLive = Layer.unwrap(
  Effect.gen(function* () {
    const paths = yield* AppPaths
    yield* Effect.promise(() => mkdir(dirname(paths.database), { recursive: true }))
    return makeStorageLayer(paths.database)
  }),
)

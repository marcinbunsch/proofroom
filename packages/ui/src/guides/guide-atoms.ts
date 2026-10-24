import type { GuideId } from "@proofroom/protocol"
import { Effect, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { ProofroomClient } from "../rpc/ProofroomClient.ts"

// The UI's state about guides. Components read these atoms and stay
// presentational; nothing about guides is kept in component state.

// The guide shown in the main pane, or none.
export const selectedGuideIdAtom = Atom.make<GuideId | null>(null)

// Which tab of the open guide is showing: the guide itself, or its whole diff.
export type GuideTab = "guide" | "diff"
export const guideTabAtom = Atom.make<GuideTab>("guide")

// Every guide, newest first. Refreshed after a guide is started.
export const guideListAtom = ProofroomClient.query("listGuides", undefined, {
  reactivityKeys: ["guides"],
})

// A guide as it is being written: the server sends the whole guide again each
// time it changes, and the atom holds the latest one.
export const guideAtom = Atom.family((guideId: GuideId) =>
  ProofroomClient.runtime.atom(
    Stream.unwrap(
      Effect.gen(function* () {
        const client = yield* ProofroomClient
        return client("watchGuide", { guideId })
      }),
    ),
  ),
)

// A guide's hunks. They never change once the guide exists.
export const hunksAtom = Atom.family((guideId: GuideId) =>
  ProofroomClient.query("getHunks", { guideId }),
)

export const startGuideAtom = ProofroomClient.mutation("generateGuide")

import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { ProofroomRpcs } from "@proofroom/protocol"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { RpcHandlersLive } from "./rpc/rpc-handlers.ts"
import { ServerLive } from "./ServerLayer.ts"

// Starts Proofroom's server: the UI talks to it over RPC at /rpc. It listens
// on the laptop only.
//
// The RPC runs over plain HTTP, with each response streamed back as
// newline-separated JSON, so watchGuide can send a guide again every time it
// changes.

const RpcLive = RpcServer.layerHttp({ group: ProofroomRpcs, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(RpcHandlersLive),
  Layer.provide(RpcSerialization.layerNdjson),
)

// 4790 unless PROOFROOM_PORT says otherwise.
const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Int("PROOFROOM_PORT").pipe(Config.withDefault(4790))
    return NodeHttpServer.layer(() => createServer(), { port, host: "127.0.0.1" })
  }),
)

const Main = RpcLive.pipe(
  HttpRouter.serve,
  Layer.provide(HttpServerLive),
  Layer.provide(ServerLive),
)

Layer.launch(Main).pipe(NodeRuntime.runMain)

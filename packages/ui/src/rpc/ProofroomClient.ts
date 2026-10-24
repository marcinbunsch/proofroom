import { ProofroomRpcs } from "@proofroom/protocol"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"

// The UI's connection to the server, built from the same procedure
// definitions the server implements. It speaks the server's protocol: HTTP
// POSTs to /rpc, answered in newline-separated JSON, so streamed procedures
// like watchGuide arrive piece by piece. In development, Vite passes /rpc on
// to the server (see vite.config.ts).
export class ProofroomClient extends AtomRpc.Service<ProofroomClient>()(
  "proofroom/ui/ProofroomClient",
  {
    group: ProofroomRpcs,
    protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  },
) {}

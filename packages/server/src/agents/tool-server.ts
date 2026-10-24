import { createServer } from "node:http"
import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer, type Scope } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { HttpRouter, HttpServer, type HttpServerError } from "effect/http"

// The MCP server one agent run talks to. Each run gets its own, with the tools
// that run may use, and it shuts down when the run's scope closes.
//
// It listens on the laptop only, on a port the system picks, under a path
// with a random part that only this run is told. Something else on the laptop
// would have to guess both to reach it.

export interface ToolServer {
  readonly url: string
  // The names the agent CLI must be allowed to call, e.g. "set_overview".
  readonly toolNames: ReadonlyArray<string>
}

// A run's tools, registered with their handlers and ready to serve, e.g.
// `McpServer.toolkit(PlannerToolkit).pipe(Layer.provide(handlers))`. Nothing
// is left to provide but the MCP server itself.
export type RegisteredTools = Layer.Layer<never, never, McpServer.McpServer>

export function serveTools(
  tools: RegisteredTools,
  toolNames: ReadonlyArray<string>,
): Effect.Effect<ToolServer, HttpServerError.ServeError, Scope.Scope> {
  return Effect.gen(function* () {
    const path: `/${string}` = `/mcp/${crypto.randomUUID()}`
    const server = yield* Layer.build(toolServerLayer(tools, path)).pipe(
      // The server's own options are fixed in this file; if they are wrong,
      // that is a bug here, not something a caller can handle.
      Effect.catchTag("IllegalArgumentError", Effect.die),
    )
    const address = Context.get(server, HttpServer.HttpServer).address
    return { url: `${HttpServer.formatAddress(address)}${path}`, toolNames }
  })
}

function toolServerLayer(tools: RegisteredTools, path: `/${string}`) {
  const mcpServer = McpServer.layerHttp({
    name: "proofroom",
    version: "1",
    path,
    // The newest protocol first; both Claude Code and Codex speak 2025-06-18.
    protocols: [McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
  })
  return tools.pipe(
    Layer.provide(mcpServer),
    // No request log: an agent makes dozens of calls per run, and the run's
    // own start and finish lines are what matter.
    (registered) => HttpRouter.serve(registered, { disableLogger: true, disableListenLog: true }),
    // Port 0: the system picks a free one.
    Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0, host: "127.0.0.1" })),
  )
}

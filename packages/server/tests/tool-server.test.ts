import { assert, describe, it } from "@effect/vitest"
import { ToolRejected } from "@proofroom/protocol"
import { Effect, Exit, Layer, Ref, Schema } from "effect"
import { McpServer, Tool, Toolkit } from "effect/ai"
import { serveTools } from "../src/agents/tool-server.ts"
import { AgentClient } from "./fixtures/AgentClient.ts"

// A one-tool toolkit standing in for the planner's and chapter's tools.
const RecordNote = Tool.make("record_note", {
  description: "Record a note about the pull request.",
  parameters: Schema.Struct({ note: Schema.NonEmptyString }),
  success: Schema.String,
  failure: ToolRejected,
})
const NoteToolkit = Toolkit.make(RecordNote)

// Serves the note tool for the length of the test, recording every note the
// handler accepts. Notes mentioning "TODO" are refused, like a real handler
// refusing a bad call.
function serveNoteTool(recordedNotes: Ref.Ref<Array<string>>) {
  const handlers = NoteToolkit.toLayer({
    record_note: ({ note }) =>
      note.includes("TODO")
        ? Effect.fail(new ToolRejected({ message: "Notes can't be TODOs." }))
        : Ref.update(recordedNotes, (notes) => [...notes, note]).pipe(Effect.as("Note saved.")),
  })
  const tools = McpServer.toolkit(NoteToolkit).pipe(Layer.provide(handlers))
  return serveTools(tools, Object.keys(NoteToolkit.tools))
}

describe("serveTools", () => {
  it.effect(
    "tools served -> the agent sees exactly these tools, and a call reaches the handler",
    () =>
      Effect.gen(function* () {
        const recordedNotes = yield* Ref.make<Array<string>>([])
        const server = yield* serveNoteTool(recordedNotes)
        const agent = yield* AgentClient.connect(server.url)

        const toolNames = yield* agent.listToolNames()
        const reply = yield* agent.callTool("record_note", {
          note: "Rounding moved after the discount.",
        })

        assert.deepStrictEqual(toolNames, ["record_note"])
        assert.deepStrictEqual(server.toolNames, ["record_note"])
        assert.deepStrictEqual(reply, { isError: false, text: "Note saved." })
        assert.deepStrictEqual(yield* Ref.get(recordedNotes), [
          "Rounding moved after the discount.",
        ])
      }).pipe(Effect.scoped),
  )

  it.effect(
    "arguments that don't match the schema -> an error back, and the handler never runs",
    () =>
      Effect.gen(function* () {
        const recordedNotes = yield* Ref.make<Array<string>>([])
        const server = yield* serveNoteTool(recordedNotes)
        const agent = yield* AgentClient.connect(server.url)

        const reply = yield* agent.callTool("record_note", { note: "" })

        assert.isTrue(reply.isError)
        assert.deepStrictEqual(yield* Ref.get(recordedNotes), [])
      }).pipe(Effect.scoped),
  )

  it.effect("handler refuses the call -> the agent reads the refusal", () =>
    Effect.gen(function* () {
      const recordedNotes = yield* Ref.make<Array<string>>([])
      const server = yield* serveNoteTool(recordedNotes)
      const agent = yield* AgentClient.connect(server.url)

      const reply = yield* agent.callTool("record_note", { note: "TODO explain coupons" })

      assert.deepStrictEqual(reply, { isError: true, text: "Notes can't be TODOs." })
    }).pipe(Effect.scoped),
  )

  it.effect("two runs -> two servers at different addresses", () =>
    Effect.gen(function* () {
      const recordedNotes = yield* Ref.make<Array<string>>([])
      const firstServer = yield* serveNoteTool(recordedNotes)
      const secondServer = yield* serveNoteTool(recordedNotes)

      assert.notStrictEqual(firstServer.url, secondServer.url)
      assert.match(firstServer.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f-]{36}$/)
    }).pipe(Effect.scoped),
  )

  it.effect("run's scope closed -> the server no longer answers", () =>
    Effect.gen(function* () {
      const recordedNotes = yield* Ref.make<Array<string>>([])
      const server = yield* Effect.scoped(serveNoteTool(recordedNotes))

      const request = yield* Effect.exit(
        Effect.tryPromise(() => fetch(server.url, { method: "POST" })),
      )

      assert.isTrue(Exit.isFailure(request))
    }),
  )
})

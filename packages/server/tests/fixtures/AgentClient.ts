import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { Effect } from "effect"

// Talks to a Proofroom tool server the way an agent CLI does, through the
// official MCP client. Tests use it to check what an agent would see.

export interface ToolReply {
  readonly isError: boolean
  readonly text: string
}

export class AgentClient {
  private constructor(private readonly client: Client) {}

  // Connected until the surrounding scope closes.
  static connect(url: string) {
    return Effect.acquireRelease(
      Effect.promise(async () => {
        const client = new Client({ name: "proofroom-test-agent", version: "1" })
        await client.connect(new StreamableHTTPClientTransport(new URL(url)))
        return new AgentClient(client)
      }),
      (agent) => Effect.promise(() => agent.client.close()),
    )
  }

  listToolNames(): Effect.Effect<Array<string>> {
    return Effect.promise(async () => {
      const { tools } = await this.client.listTools()
      return tools.map((tool) => tool.name)
    })
  }

  // A call the server refuses outright (arguments that don't match the tool's
  // schema) comes back as an error reply too, just as the agent would see it.
  callTool(name: string, args: Record<string, unknown>): Effect.Effect<ToolReply> {
    return Effect.promise(async () => {
      try {
        const result = await this.client.callTool({ name, arguments: args })
        return { isError: result.isError === true, text: textOf(result.content) }
      } catch (error) {
        return { isError: true, text: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .filter((item): item is { type: "text"; text: string } => item?.type === "text")
    .map((item) => item.text)
    .join("\n")
}

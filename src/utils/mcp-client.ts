import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { VERSION } from "../version.js";

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ServerConnection {
  client: Client;
  transport: unknown;
}

export async function connectToServer(
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<ServerConnection> {
  const client = new Client({
    name: "mcp-lazy-proxy",
    version: VERSION,
  });

  const mergedEnv = { ...process.env, ...env } as Record<string, string>;

  const transport = new StdioClientTransport({
    command,
    args,
    env: mergedEnv,
  });

  await client.connect(transport);
  return { client, transport };
}

export async function listServerTools(
  client: Client
): Promise<ToolDefinition[]> {
  const allTools: ToolDefinition[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools({ cursor });
    for (const tool of result.tools) {
      allTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      });
    }
    cursor = result.nextCursor;
  } while (cursor);

  return allTools;
}

export async function callServerTool(
  client: Client,
  toolName: string,
  args?: Record<string, unknown>
): Promise<unknown> {
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });
  return result;
}

export async function disconnectServer(
  connection: ServerConnection
): Promise<void> {
  await connection.client.close();
}

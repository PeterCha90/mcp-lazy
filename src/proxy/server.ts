import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import { ServerLoader } from "./loader.js";
import { VERSION } from "../version.js";

export async function createProxyServer(
  registry: ToolRegistry,
  loader: ServerLoader
): Promise<McpServer> {
  const server = new McpServer({
    name: "mcp-lazy",
    version: VERSION,
  });

  // Tool 1: mcp_search_tools
  server.tool(
    "mcp_search_tools",
    `Search available MCP tools by keyword.
Use this BEFORE calling any MCP tool.
Returns matching tool names, server names, and descriptions.
Example: mcp_search_tools("query database") → postgres-mcp.query_database`,
    {
      query: z.string().describe("What you want to do in natural language"),
      limit: z.number().optional().default(5).describe("Max results to return (default: 5)"),
    },
    async ({ query, limit }) => {
      const results = registry.search(query, limit);

      if (results.length === 0) {
        // Suggest similar tools
        const allServers = registry.getServerNames();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                results: [],
                suggestion: `No tools found for "${query}". Available servers: ${allServers.join(", ")}. Try different keywords.`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results }),
          },
        ],
      };
    }
  );

  // Tool 2: mcp_execute_tool
  server.tool(
    "mcp_execute_tool",
    `Execute a specific MCP tool.
Use tool_name and server_name from mcp_search_tools results.`,
    {
      tool_name: z.string().describe("Tool name from mcp_search_tools"),
      server_name: z.string().describe("Server name from mcp_search_tools"),
      arguments: z.record(z.unknown()).optional().describe("Tool arguments"),
    },
    async ({ tool_name, server_name, arguments: args }) => {
      // Verify tool exists in registry
      const tool = registry.findTool(tool_name, server_name);
      if (!tool) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Tool "${tool_name}" not found in server "${server_name}". Use mcp_search_tools first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Verify server config exists
      if (!loader.hasConfig(server_name)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Server "${server_name}" is not configured.`,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Lazy-load server (cached after first call)
        const client = await loader.getClient(server_name);

        // Call the actual tool
        const result = await client.callTool({
          name: tool_name,
          arguments: args ?? {},
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const alternatives = registry.search(tool_name, 3);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Failed to execute ${tool_name} on ${server_name}: ${message}`,
                alternatives: alternatives.length > 0 ? alternatives : undefined,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

export async function startProxyServer(
  registry: ToolRegistry,
  loader: ServerLoader
): Promise<void> {
  const server = await createProxyServer(registry, loader);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await loader.closeAll();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await loader.closeAll();
    process.exit(0);
  });
}

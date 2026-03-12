import { resolve } from "node:path";
import {
  findMcpConfigs,
  mergeServerConfigs,
  saveLazyConfig,
  type ServerConfig,
  type LazyConfig,
} from "../utils/config.js";
import {
  connectToServer,
  listServerTools,
  disconnectServer,
  type ToolDefinition,
} from "../utils/mcp-client.js";
import { detectInstalledAgents, registerProxy } from "../agents/index.js";

const TOKENS_PER_TOOL = 650;
const PROXY_BASE_TOKENS = 2100;
const CONTEXT_WINDOW = 200_000;

interface ServerScanResult {
  name: string;
  tools: ToolDefinition[];
  tokenEstimate: number;
}

export async function runInit(): Promise<void> {
  const cwd = process.cwd();
  const configOutputPath = resolve(cwd, "mcp-lazy-config.json");

  // 1. Find existing MCP configs
  console.log("\nSearching for MCP configurations...\n");
  const configs = findMcpConfigs(cwd);

  if (configs.length === 0) {
    console.log("  No MCP configurations found.");
    console.log("  Checked: .mcp.json, .cursor/mcp.json, ~/.cursor/mcp.json, and more.");
    console.log("\n  Create a .mcp.json file with your MCP server configs first.\n");
    return;
  }

  const merged = mergeServerConfigs(configs);
  const serverNames = Object.keys(merged);

  console.log(`  Found ${configs.length} config file(s) with ${serverNames.length} server(s)\n`);
  for (const { path } of configs) {
    console.log(`    ${path}`);
  }

  // 2. Connect to each server to get tool lists
  console.log("\nCollecting tool definitions...\n");

  const results: ServerScanResult[] = [];
  const failedServers: { name: string; error: string }[] = [];

  for (const name of serverNames) {
    const config = merged[name];
    try {
      const conn = await connectToServer(
        config.command,
        config.args,
        config.env
      );
      const tools = await listServerTools(conn.client);
      const tokenEstimate = tools.length * TOKENS_PER_TOOL;

      results.push({ name, tools, tokenEstimate });
      console.log(
        `  ✓ ${name.padEnd(24)} ${String(tools.length).padStart(3)} tools  ~${String(tokenEstimate).padStart(6)} tokens`
      );

      await disconnectServer(conn);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedServers.push({ name, error: message });
      console.log(`  ✗ ${name.padEnd(24)} connection failed: ${message}`);
    }
  }

  if (results.length === 0 && failedServers.length > 0) {
    console.log("\n  Could not connect to any servers.");
    console.log("  mcp-lazy-config.json will still be generated with server configs.");
    console.log("  Tool discovery will happen at serve time.\n");
  }

  // 3. Show token savings
  const totalTools = results.reduce((sum, r) => sum + r.tools.length, 0);
  const totalTokens = results.reduce((sum, r) => sum + r.tokenEstimate, 0);
  const savingsPercent =
    totalTokens > 0
      ? Math.round(((totalTokens - PROXY_BASE_TOKENS) / totalTokens) * 100)
      : 0;

  if (totalTools > 0) {
    console.log(
      `\n  Current estimated token usage: ${totalTokens.toLocaleString()} tokens (${((totalTokens / CONTEXT_WINDOW) * 100).toFixed(1)}% of ${(CONTEXT_WINDOW / 1000).toFixed(0)}k)`
    );
    console.log(
      `  With mcp-lazy:                ${PROXY_BASE_TOKENS.toLocaleString()} tokens  (${((PROXY_BASE_TOKENS / CONTEXT_WINDOW) * 100).toFixed(1)}% of ${(CONTEXT_WINDOW / 1000).toFixed(0)}k)`
    );
    console.log(`  Savings:                      ${savingsPercent}%`);
  }

  // 4. Build the servers config (include all servers, even failed ones)
  const serversForConfig: Record<string, ServerConfig> = {};
  for (const name of serverNames) {
    const config = merged[name];
    const scan = results.find((r) => r.name === name);
    serversForConfig[name] = {
      command: config.command,
      args: config.args,
      ...(config.env ? { env: config.env } : {}),
      description:
        config.description ??
        (scan
          ? `${scan.tools.length} tools available`
          : undefined),
    };
  }

  // 5. Save mcp-lazy-config.json
  const lazyConfig: LazyConfig = {
    version: "1.0",
    servers: serversForConfig,
  };
  saveLazyConfig(configOutputPath, lazyConfig);
  console.log(`\n  Generated: mcp-lazy-config.json`);

  // 6. Detect and register agents
  const agents = detectInstalledAgents();

  if (agents.length === 0) {
    console.log("\n  No supported agents detected.");
    console.log("  Use 'mcp-lazy add --cursor' (or similar) to register manually.\n");
    return;
  }

  console.log(`\n  Registering proxy with detected agents...\n`);

  for (const agent of agents) {
    try {
      const { configPath, created } = registerProxy(agent, configOutputPath);
      const action = created ? "created" : "updated";
      const note = agent.note ? ` (${agent.note})` : "";
      console.log(`  ✓ ${agent.displayName}: ${action} ${configPath}${note}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${agent.displayName}: failed - ${message}`);
    }
  }

  console.log("\n  Done! Restart your agents to activate mcp-lazy.\n");
}

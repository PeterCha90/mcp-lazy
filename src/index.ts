#!/usr/bin/env node

import { Command } from "commander";
import { runAdd } from "./cli/add.js";
import { runDoctor } from "./cli/doctor.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("mcp-lazy")
  .description("MCP lazy loading proxy - reduce context window token usage by 90%+")
  .version(VERSION);

program
  .command("add")
  .description("Register mcp-lazy proxy with an agent")
  .option("--cursor", "Register with Cursor")
  .option("--opencode", "Register with Opencode")
  .option("--antigravity", "Register with Antigravity")
  .option("--codex", "Register with Codex")
  .option("--all", "Register with all agents")
  .action(async (options) => {
    await runAdd(options);
  });

program
  .command("doctor")
  .description("Check installation status and token savings")
  .action(async () => {
    await runDoctor();
  });

program
  .command("serve")
  .description("Start the mcp-lazy proxy server (stdio mode)")
  .action(async () => {
    await runServe();
  });

async function runServe(): Promise<void> {
  const { loadServersBackup, computeServerFingerprint, loadToolCache, saveToolCache } = await import("./utils/config.js");
  const { ToolRegistry, extractKeywords } = await import("./proxy/registry.js");
  const { ServerLoader } = await import("./proxy/loader.js");
  const { startProxyServer } = await import("./proxy/server.js");
  const { connectToServer, listServerTools, disconnectServer } = await import(
    "./utils/mcp-client.js"
  );

  // Load servers from ~/.mcp-lazy/servers.json
  const servers = loadServersBackup();
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    console.error("No MCP servers found. Check your MCP configurations.");
    process.exit(1);
  }

  // Build the tool registry by connecting to each server once
  const registry = new ToolRegistry();
  const startMs = Date.now();

  const fingerprint = computeServerFingerprint(servers);
  const cached = loadToolCache();

  if (cached && cached.fingerprint === fingerprint) {
    // Cache hit: load tools directly, skip all connections
    for (const entry of cached.tools) {
      registry.addTool(entry);
    }
    const elapsed = Date.now() - startMs;
    console.error(`mcp-lazy: loaded ${registry.getToolCount()} tools from cache in ${elapsed}ms`);
  } else {
    // Cache miss or config changed: connect to all servers in parallel
    const results = await Promise.allSettled(
      serverNames.map(async (name) => {
        const serverConfig = servers[name];
        if (!serverConfig.command) {
          console.error(`Warning: ${name} has no command configured, skipping`);
          return [];
        }
        const conn = await connectToServer(serverConfig.command, serverConfig.args, serverConfig.env);
        const tools = await listServerTools(conn.client);
        await disconnectServer(conn);
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
          server: name,
          serverDescription: serverConfig.description ?? "",
          inputSchema: tool.inputSchema,
          keywords: extractKeywords(tool.name, tool.description ?? ""),
        }));
      })
    );

    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        for (const entry of result.value) {
          registry.addTool(entry);
        }
        if (result.value.length > 0) successCount++;
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`Warning: could not connect to ${serverNames[i]}: ${message}`);
      }
    }

    const elapsed = Date.now() - startMs;
    console.error(`mcp-lazy: discovered ${registry.getToolCount()} tools from ${successCount} servers in ${elapsed}ms`);

    // Save cache for next startup
    saveToolCache(fingerprint, registry.getAllTools());
  }

  if (registry.getToolCount() === 0) {
    console.error("No tools discovered from any server. Check your MCP configurations.");
    process.exit(1);
  }

  // Create the loader for lazy re-connections during execution
  const loader = new ServerLoader(servers);

  // Start the proxy server (stdio)
  await startProxyServer(registry, loader);
}

program.parse();

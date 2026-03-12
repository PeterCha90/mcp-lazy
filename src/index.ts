#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import { runInit } from "./cli/init.js";
import { runAdd } from "./cli/add.js";
import { runDoctor } from "./cli/doctor.js";

const program = new Command();

program
  .name("mcp-lazy")
  .description("MCP lazy loading proxy - reduce context window token usage by 90%+")
  .version("0.1.0");

program
  .command("init")
  .description("Scan existing MCP configs and generate mcp-lazy-config.json")
  .action(async () => {
    await runInit();
  });

program
  .command("add")
  .description("Register mcp-lazy proxy with an agent")
  .option("--cursor", "Register with Cursor")
  .option("--windsurf", "Register with Windsurf")
  .option("--opencode", "Register with Opencode")
  .option("--antigravity", "Register with Antigravity")
  .option("--all", "Register with all detected agents")
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
  .requiredOption("--config <path>", "Path to mcp-lazy-config.json")
  .action(async (options) => {
    await runServe(options.config);
  });

async function runServe(configPath: string): Promise<void> {
  const { loadLazyConfig } = await import("./utils/config.js");
  const { ToolRegistry, extractKeywords } = await import("./proxy/registry.js");
  const { ServerLoader } = await import("./proxy/loader.js");
  const { startProxyServer } = await import("./proxy/server.js");
  const { connectToServer, listServerTools, disconnectServer } = await import(
    "./utils/mcp-client.js"
  );

  const fullPath = resolve(configPath);
  const config = loadLazyConfig(fullPath);
  const serverNames = Object.keys(config.servers);

  if (serverNames.length === 0) {
    console.error("No servers configured in", fullPath);
    process.exit(1);
  }

  // Build the tool registry by connecting to each server once
  const registry = new ToolRegistry();

  for (const name of serverNames) {
    const serverConfig = config.servers[name];
    try {
      const conn = await connectToServer(
        serverConfig.command,
        serverConfig.args,
        serverConfig.env
      );
      const tools = await listServerTools(conn.client);

      for (const tool of tools) {
        registry.addTool({
          name: tool.name,
          description: tool.description ?? "",
          server: name,
          serverDescription: serverConfig.description ?? "",
          inputSchema: tool.inputSchema,
          keywords: extractKeywords(tool.name, tool.description ?? ""),
        });
      }

      await disconnectServer(conn);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Warning: could not connect to ${name}: ${message}`);
    }
  }

  if (registry.getToolCount() === 0) {
    console.error("No tools discovered from any server. Check your config.");
    process.exit(1);
  }

  // Create the loader for lazy re-connections during execution
  const loader = new ServerLoader(config.servers);

  // Start the proxy server (stdio)
  await startProxyServer(registry, loader);
}

program.parse();

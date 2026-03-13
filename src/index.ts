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
  .option("--windsurf", "Register with Windsurf")
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
  const { loadServersBackup } = await import("./utils/config.js");
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

  for (const name of serverNames) {
    const serverConfig = servers[name];
    try {
      if (!serverConfig.command) {
        console.error(`Warning: ${name} has no command configured, skipping`);
        continue;
      }
      const conn = await connectToServer(serverConfig.command, serverConfig.args, serverConfig.env);
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
    console.error("No tools discovered from any server. Check your MCP configurations.");
    process.exit(1);
  }

  // Create the loader for lazy re-connections during execution
  const loader = new ServerLoader(servers);

  // Start the proxy server (stdio)
  await startProxyServer(registry, loader);
}

program.parse();

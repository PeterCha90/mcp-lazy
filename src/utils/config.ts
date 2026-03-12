import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// Schema for a single MCP server config entry
const ServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  description: z.string().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// Schema for .mcp.json format (used by agents)
const McpJsonSchema = z.object({
  mcpServers: z.record(ServerConfigSchema),
});

// Schema for mcp-lazy-config.json
const LazyConfigSchema = z.object({
  version: z.string().default("1.0"),
  servers: z.record(ServerConfigSchema),
});

export type LazyConfig = z.infer<typeof LazyConfigSchema>;

// All possible config file locations to search
const CONFIG_SEARCH_PATHS = [
  ".mcp.json",
  ".cursor/mcp.json",
  ".opencode/mcp.json",
  ".agents/mcp.json",
];

const HOME_CONFIG_PATHS = [
  ".cursor/mcp.json",
  ".codeium/windsurf/mcp_config.json",
  "claude_desktop_config.json",
];

export function findMcpConfigs(cwd: string = process.cwd()): { path: string; servers: Record<string, ServerConfig> }[] {
  const results: { path: string; servers: Record<string, ServerConfig> }[] = [];
  const home = homedir();

  // Search in current directory
  for (const rel of CONFIG_SEARCH_PATHS) {
    const fullPath = resolve(cwd, rel);
    if (existsSync(fullPath)) {
      try {
        const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
        const parsed = McpJsonSchema.safeParse(raw);
        if (parsed.success) {
          results.push({ path: fullPath, servers: parsed.data.mcpServers });
        }
      } catch {}
    }
  }

  // Search in home directory
  for (const rel of HOME_CONFIG_PATHS) {
    const fullPath = resolve(home, rel);
    if (existsSync(fullPath)) {
      try {
        const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
        const parsed = McpJsonSchema.safeParse(raw);
        if (parsed.success) {
          results.push({ path: fullPath, servers: parsed.data.mcpServers });
        }
      } catch {}
    }
  }

  return results;
}

export function loadLazyConfig(configPath: string): LazyConfig {
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return LazyConfigSchema.parse(raw);
}

export function saveLazyConfig(configPath: string, config: LazyConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function mergeServerConfigs(
  configs: { path: string; servers: Record<string, ServerConfig> }[]
): Record<string, ServerConfig> {
  const merged: Record<string, ServerConfig> = {};
  for (const { servers } of configs) {
    Object.assign(merged, servers);
  }
  return merged;
}

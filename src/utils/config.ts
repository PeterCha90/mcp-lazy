import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// Schema for a single MCP server config entry
// Supports stdio servers (command+args) and URL-based servers (url)
const ServerConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().optional(),
  serverUrl: z.string().optional(),
  headers: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
  description: z.string().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// Schema for .mcp.json format (used by agents)
const McpJsonSchema = z.object({
  mcpServers: z.record(ServerConfigSchema),
});

function getBackupPath(): string {
  return resolve(homedir(), ".mcp-lazy", "servers.json");
}

/**
 * Save servers to ~/.mcp-lazy/servers.json (merges with existing)
 */
export function saveServersBackup(servers: Record<string, ServerConfig>): void {
  const existing = loadServersBackup();
  const merged = { ...existing, ...servers };
  // Never include mcp-lazy itself
  delete merged["mcp-lazy"];

  const dir = dirname(getBackupPath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getBackupPath(), JSON.stringify({ servers: merged }, null, 2) + "\n");
}

/**
 * Load servers from ~/.mcp-lazy/servers.json
 */
export function loadServersBackup(): Record<string, ServerConfig> {
  if (!existsSync(getBackupPath())) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(getBackupPath(), "utf-8"));
    return raw.servers ?? {};
  } catch {
    return {};
  }
}

/**
 * Convert a URL-based server config to a mcp-remote stdio command.
 * e.g., { url: "https://mcp.notion.com/mcp", headers: { "Auth": "Bearer x" } }
 * → { command: "npx", args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp", "--header", "Auth:Bearer x"] }
 */
export function convertUrlToMcpRemote(url: string, headers?: Record<string, string>): ServerConfig {
  const args = ["-y", "mcp-remote", url];
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      args.push("--header", `${key}:${value}`);
    }
  }
  return { command: "npx", args };
}

/**
 * Extract MCP servers from a TOML config file (Codex format)
 * Parses [mcp_servers.XXX] sections and extracts command/args.
 * Filters out mcp-lazy entries.
 */
export function extractServersFromToml(content: string): Record<string, ServerConfig> {
  const servers: Record<string, ServerConfig> = {};
  // Match all [mcp_servers.XXX] section headers
  const sectionRegex = /^\[mcp_servers\.([^\]]+)\]/gm;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(content)) !== null) {
    const name = match[1];
    if (name === "mcp-lazy") continue;

    const sectionStart = match.index + match[0].length;
    // Find next section header (any [xxx]) or end of string
    const nextSection = /^\[[^\]]+\]/m.exec(content.slice(sectionStart));
    const sectionContent = nextSection
      ? content.slice(sectionStart, sectionStart + nextSection.index)
      : content.slice(sectionStart);

    // Extract command
    const cmdMatch = /^\s*command\s*=\s*"([^"]+)"/m.exec(sectionContent);
    const command = cmdMatch ? cmdMatch[1] : undefined;

    // Extract url (for HTTP/SSE-based servers)
    const urlMatch = /^\s*url\s*=\s*"([^"]*)"/m.exec(sectionContent);
    const serverUrlMatch = /^\s*serverUrl\s*=\s*"([^"]*)"/m.exec(sectionContent);
    const url = urlMatch ? urlMatch[1] : (serverUrlMatch ? serverUrlMatch[1] : undefined);

    // Extract args array: args = ["a", "b", ...]
    const argsMatch = /^\s*args\s*=\s*\[([^\]]*)\]/m.exec(sectionContent);
    const args: string[] = [];
    if (argsMatch) {
      const inner = argsMatch[1];
      const itemRegex = /"([^"]*)"/g;
      let item: RegExpExecArray | null;
      while ((item = itemRegex.exec(inner)) !== null) {
        args.push(item[1]);
      }
    }

    // Extract env from [mcp_servers.NAME.env] subsection
    const env: Record<string, string> = {};
    const envSectionRegex = new RegExp(`^\\[mcp_servers\\.${name}\\.env\\]`, "m");
    if (envSectionRegex.test(content)) {
      const envStart = content.indexOf(`[mcp_servers.${name}.env]`) + `[mcp_servers.${name}.env]`.length;
      const envEnd = /^\[[^\]]+\]/m.exec(content.slice(envStart));
      const envContent = envEnd
        ? content.slice(envStart, envStart + envEnd.index)
        : content.slice(envStart);

      const envPairRegex = /^\s*(\w+)\s*=\s*"([^"]*)"/gm;
      let envMatch: RegExpExecArray | null;
      while ((envMatch = envPairRegex.exec(envContent)) !== null) {
        env[envMatch[1]] = envMatch[2];
      }
    }

    // Extract headers from [mcp_servers.NAME.http_headers] subsection
    const headers: Record<string, string> = {};
    const headersSectionRegex = new RegExp(`^\\[mcp_servers\\.${name}\\.http_headers\\]`, "m");
    if (headersSectionRegex.test(content)) {
      const headersStart = content.indexOf(`[mcp_servers.${name}.http_headers]`) + `[mcp_servers.${name}.http_headers]`.length;
      const headersEnd = /^\[[^\]]+\]/m.exec(content.slice(headersStart));
      const headersContent = headersEnd
        ? content.slice(headersStart, headersStart + headersEnd.index)
        : content.slice(headersStart);
      const headerPairRegex = /^\s*(\S+)\s*=\s*"([^"]*)"/gm;
      let headerMatch: RegExpExecArray | null;
      while ((headerMatch = headerPairRegex.exec(headersContent)) !== null) {
        headers[headerMatch[1]] = headerMatch[2];
      }
    }

    // Extract bearer_token_env_var and resolve to Authorization header
    const bearerMatch = /^\s*bearer_token_env_var\s*=\s*"([^"]*)"/m.exec(sectionContent);
    if (bearerMatch) {
      const envVarName = bearerMatch[1];
      const token = process.env[envVarName];
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    if (command) {
      servers[name] = { command, args, ...(url && { url }), ...(Object.keys(env).length > 0 && { env }), ...(Object.keys(headers).length > 0 && { headers }) };
    } else if (url) {
      servers[name] = { args, url, ...(Object.keys(env).length > 0 && { env }), ...(Object.keys(headers).length > 0 && { headers }) };
    }
  }

  return servers;
}

/**
 * Extract MCP servers from an agent's config file (JSON format)
 */
export function extractServersFromConfig(configPath: string): Record<string, ServerConfig> {
  if (!existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const parsed = McpJsonSchema.safeParse(raw);
    if (!parsed.success) return {};
    const servers = { ...parsed.data.mcpServers };
    delete servers["mcp-lazy"];
    // Normalize serverUrl → url
    for (const config of Object.values(servers)) {
      if (config.serverUrl && !config.url) {
        config.url = config.serverUrl;
      }
      delete (config as any).serverUrl;
    }
    return servers;
  } catch {
    return {};
  }
}

function getToolCachePath(): string {
  return resolve(homedir(), ".mcp-lazy", "tool-cache.json");
}

/**
 * Compute a fingerprint for a set of server configs.
 * Any change to server names, commands, or args invalidates the cache.
 */
export function computeServerFingerprint(servers: Record<string, ServerConfig>): string {
  const parts = Object.keys(servers)
    .sort()
    .map((name) => {
      const s = servers[name];
      return `${name}:${s.command ?? ""}:${(s.args ?? []).join(",")}`;
    });
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Load the tool cache from ~/.mcp-lazy/tool-cache.json.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function loadToolCache(): { fingerprint: string; tools: any[] } | null {
  const cachePath = getToolCachePath();
  if (!existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (typeof raw.fingerprint === "string" && Array.isArray(raw.tools)) {
      return raw as { fingerprint: string; tools: any[] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save the tool cache to ~/.mcp-lazy/tool-cache.json.
 */
export function saveToolCache(fingerprint: string, tools: any[]): void {
  const cachePath = getToolCachePath();
  const dir = dirname(cachePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(cachePath, JSON.stringify({ fingerprint, tools }, null, 2) + "\n");
}

/**
 * Extract MCP servers from Opencode's config format.
 * Opencode uses { mcp: { name: { type, command: [...], environment } } }
 */
export function extractServersFromOpencodeConfig(configPath: string): Record<string, ServerConfig> {
  if (!existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const mcpSection = raw.mcp;
    if (!mcpSection || typeof mcpSection !== "object") return {};

    const servers: Record<string, ServerConfig> = {};
    for (const [name, config] of Object.entries(mcpSection)) {
      if (name === "mcp-lazy") continue;
      const cfg = config as any;

      if (cfg.type === "local" && Array.isArray(cfg.command) && cfg.command.length > 0) {
        // Stdio server: command is array, first element is command, rest are args
        servers[name] = {
          command: cfg.command[0],
          args: cfg.command.slice(1),
          ...(cfg.environment && { env: cfg.environment }),
        };
      } else if (cfg.type === "remote" && cfg.url) {
        // HTTP/SSE server
        servers[name] = {
          url: cfg.url,
          args: [],
          ...(cfg.headers && { headers: cfg.headers }),
        };
      }
    }
    return servers;
  } catch {
    return {};
  }
}

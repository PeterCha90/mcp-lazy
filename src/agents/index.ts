import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { extractServersFromConfig, extractServersFromToml, extractServersFromOpencodeConfig, saveServersBackup, convertUrlToMcpRemote, type ServerConfig } from "../utils/config.js";

export interface AgentInfo {
  name: string;
  displayName: string;
  configPaths: string[];
  format?: "json" | "toml" | "opencode";
  note?: string;
}

function resolvePath(p: string): string {
  const home = homedir();
  const cwd = process.cwd();
  return p.startsWith("~") ? resolve(home, p.slice(2)) : resolve(cwd, p);
}

export const AGENTS: AgentInfo[] = [
  {
    name: "cursor",
    displayName: "Cursor",
    configPaths: ["~/.cursor/mcp.json"],
  },
  {
    name: "windsurf",
    displayName: "Windsurf",
    configPaths: ["~/.codeium/windsurf/mcp_config.json"],
  },
  {
    name: "opencode",
    displayName: "Opencode",
    configPaths: ["~/.config/opencode/config.json"],
    format: "opencode",
  },
  {
    name: "antigravity",
    displayName: "Antigravity",
    configPaths: ["~/.gemini/antigravity/mcp_config.json"],
  },
  {
    name: "codex",
    displayName: "Codex",
    configPaths: ["~/.codex/config.toml"],
    format: "toml",
  },
];

export function detectInstalledAgents(): AgentInfo[] {
  return AGENTS.filter((agent) =>
    agent.configPaths.some((p) => existsSync(resolvePath(p)))
  );
}

export function getAgentByName(name: string): AgentInfo | undefined {
  return AGENTS.find((a) => a.name === name);
}

export function findAgentConfig(agent: AgentInfo): string | null {
  for (const p of agent.configPaths) {
    const resolved = resolvePath(p);
    if (existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

function generateProxyEntry(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "mcp-lazy", "serve"],
  };
}

export function registerProxy(
  agent: AgentInfo
): { configPath: string; created: boolean; serverCount: number } {
  const existing = findAgentConfig(agent);
  const fallback = agent.configPaths[0];
  let targetPath = existing ?? resolvePath(fallback);

  let created = false;
  let serverCount = 0;

  if (agent.format === "opencode") {
    if (existsSync(targetPath)) {
      try {
        const fullConfig = JSON.parse(readFileSync(targetPath, "utf-8"));
        const mcpSection = fullConfig.mcp || {};

        const serversToBackup: Record<string, ServerConfig> = {};

        for (const [name, cfg] of Object.entries(mcpSection)) {
          if (name === "mcp-lazy") continue;
          const c = cfg as any;
          if (c.type === "remote" && c.url) {
            // Convert URL to mcp-remote
            serversToBackup[name] = convertUrlToMcpRemote(c.url, c.headers);
          } else if (c.type === "local" && Array.isArray(c.command) && c.command.length > 0) {
            // Stdio: normalize from opencode format
            serversToBackup[name] = {
              command: c.command[0],
              args: c.command.slice(1),
              ...(c.environment && { env: c.environment }),
            };
          }
        }

        serverCount = Object.keys(serversToBackup).length;
        if (serverCount > 0) {
          saveServersBackup(serversToBackup);
        }

        // Write: only mcp-lazy (preserve non-mcp keys)
        fullConfig.mcp = {
          "mcp-lazy": {
            type: "local",
            command: ["npx", "-y", "mcp-lazy", "serve"],
          },
        };
        writeFileSync(targetPath, JSON.stringify(fullConfig, null, 2) + "\n");
      } catch {
        // If can't parse, write fresh
        const config = { mcp: { "mcp-lazy": { type: "local", command: ["npx", "-y", "mcp-lazy", "serve"] } } };
        writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");
      }
    } else {
      created = true;
      const dir = dirname(targetPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const config = { mcp: { "mcp-lazy": { type: "local", command: ["npx", "-y", "mcp-lazy", "serve"] } } };
      writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");
    }
    return { configPath: targetPath, created, serverCount };
  }

  if (agent.format === "toml") {
    if (!existsSync(targetPath)) {
      created = true;
      const dir = dirname(targetPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    const existingContent = existsSync(targetPath)
      ? readFileSync(targetPath, "utf-8")
      : "";

    // Extract all servers
    const allServers = extractServersFromToml(existingContent);
    const serversToBackup: Record<string, ServerConfig> = {};

    for (const [name, cfg] of Object.entries(allServers)) {
      if (cfg.command) {
        serversToBackup[name] = cfg;
      } else if (cfg.url) {
        // Convert URL to mcp-remote
        serversToBackup[name] = convertUrlToMcpRemote(cfg.url, cfg.headers);
      }
    }

    serverCount = Object.keys(serversToBackup).length;
    if (serverCount > 0) {
      saveServersBackup(serversToBackup);
    }

    // Strip ALL mcp_servers sections (including URL ones)
    let cleaned = existingContent.replace(
      /\n?\[mcp_servers\.[^\]]+\](?:\n(?!\[)[^\n]*)*/g,
      ""
    ).trimEnd();

    const tomlBlock =
      `\n\n[mcp_servers.mcp-lazy]\n` +
      `command = "npx"\n` +
      `args = ["-y", "mcp-lazy", "serve"]\n`;

    writeFileSync(targetPath, cleaned + tomlBlock);

    return { configPath: targetPath, created, serverCount };
  }

  // JSON agents: extract ALL servers → convert URL to mcp-remote → backup ALL → write only mcp-lazy
  if (existsSync(targetPath)) {
    // Read raw config to get original field names
    let rawConfig: any = {};
    try {
      rawConfig = JSON.parse(readFileSync(targetPath, "utf-8"));
    } catch {}
    const rawServers = rawConfig.mcpServers ?? {};

    const serversToBackup: Record<string, ServerConfig> = {};

    // Extract normalized servers via Zod
    const normalizedServers = extractServersFromConfig(targetPath);

    for (const [name, serverCfg] of Object.entries(rawServers)) {
      if (name === "mcp-lazy") continue;
      const cfg = serverCfg as any;

      if (cfg.url || cfg.serverUrl) {
        // URL server → convert to mcp-remote stdio command
        const url = cfg.url || cfg.serverUrl;
        const headers = cfg.headers;
        serversToBackup[name] = convertUrlToMcpRemote(url, headers);
      } else if (cfg.command && normalizedServers[name]) {
        // Stdio server → use normalized version
        serversToBackup[name] = normalizedServers[name];
      }
    }

    serverCount = Object.keys(serversToBackup).length;
    if (serverCount > 0) {
      saveServersBackup(serversToBackup);
    }

    // Write config with ONLY mcp-lazy (no URL servers kept)
    const config = {
      mcpServers: {
        "mcp-lazy": generateProxyEntry(),
      },
    };

    writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");
  } else {
    created = true;
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const config = {
      mcpServers: {
        "mcp-lazy": generateProxyEntry(),
      },
    };

    writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");
  }

  return { configPath: targetPath, created, serverCount };
}

export function isProxyRegistered(agent: AgentInfo): boolean {
  const configPath = findAgentConfig(agent);
  if (!configPath) return false;

  if (agent.format === "opencode") {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return !!(config.mcp && config.mcp["mcp-lazy"]);
    } catch {
      return false;
    }
  }

  if (agent.format === "toml") {
    try {
      const content = readFileSync(configPath, "utf-8");
      return content.includes("[mcp_servers.mcp-lazy]");
    } catch {
      return false;
    }
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return !!(config.mcpServers && config.mcpServers["mcp-lazy"]);
  } catch {
    return false;
  }
}

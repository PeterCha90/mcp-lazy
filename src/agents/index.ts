import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

export interface AgentInfo {
  name: string;
  displayName: string;
  configPaths: string[];
  note?: string;
}

function resolvePaths(paths: string[]): string[] {
  const home = homedir();
  const cwd = process.cwd();
  return paths.map((p) =>
    p.startsWith("~") ? resolve(home, p.slice(2)) : resolve(cwd, p)
  );
}

export const AGENTS: AgentInfo[] = [
  {
    name: "cursor",
    displayName: "Cursor",
    configPaths: [".cursor/mcp.json", "~/.cursor/mcp.json"],
  },
  {
    name: "windsurf",
    displayName: "Windsurf",
    configPaths: ["~/.codeium/windsurf/mcp_config.json"],
  },
  {
    name: "opencode",
    displayName: "Opencode",
    configPaths: [".opencode/mcp.json"],
  },
  {
    name: "antigravity",
    displayName: "Antigravity",
    configPaths: [".agents/mcp.json"],
  },
  {
    name: "claude-code",
    displayName: "Claude Code",
    configPaths: [".mcp.json"],
    note: "Claude Code has native lazy loading support",
  },
];

export function detectInstalledAgents(): AgentInfo[] {
  return AGENTS.filter((agent) => {
    const resolved = resolvePaths(agent.configPaths);
    return resolved.some((p) => existsSync(p));
  });
}

export function getAgentByName(name: string): AgentInfo | undefined {
  return AGENTS.find((a) => a.name === name);
}

export function findAgentConfig(agent: AgentInfo): string | null {
  const resolved = resolvePaths(agent.configPaths);
  for (const p of resolved) {
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

function generateProxyEntry(configPath: string): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "mcp-lazy", "serve", "--config", configPath],
  };
}

export function registerProxy(
  agent: AgentInfo,
  lazyConfigPath: string
): { configPath: string; created: boolean } {
  const resolved = resolvePaths(agent.configPaths);
  let targetPath = findAgentConfig(agent) ?? resolved[0];

  let config: Record<string, unknown> = {};
  let created = false;

  if (existsSync(targetPath)) {
    try {
      config = JSON.parse(readFileSync(targetPath, "utf-8"));
    } catch {
      config = {};
    }
  } else {
    created = true;
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  (config.mcpServers as Record<string, unknown>)["mcp-lazy"] =
    generateProxyEntry(lazyConfigPath);

  writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");

  return { configPath: targetPath, created };
}

export function isProxyRegistered(agent: AgentInfo): boolean {
  const configPath = findAgentConfig(agent);
  if (!configPath) return false;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return !!(config.mcpServers && config.mcpServers["mcp-lazy"]);
  } catch {
    return false;
  }
}

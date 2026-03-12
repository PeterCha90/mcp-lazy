import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENTS,
  getAgentByName,
  detectInstalledAgents,
  registerProxy,
  type AgentInfo,
} from "../agents/index.js";

interface AddOptions {
  cursor?: boolean;
  windsurf?: boolean;
  opencode?: boolean;
  antigravity?: boolean;
  all?: boolean;
}

export async function runAdd(options: AddOptions): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, "mcp-lazy-config.json");

  if (!existsSync(configPath)) {
    console.log("\n  mcp-lazy-config.json not found.");
    console.log("  Run 'mcp-lazy init' first to generate the config.\n");
    process.exit(1);
  }

  // Determine which agents to register
  let targets: AgentInfo[] = [];

  if (options.all) {
    targets = [...AGENTS];
  } else {
    const flagMap: Record<string, boolean | undefined> = {
      cursor: options.cursor,
      windsurf: options.windsurf,
      opencode: options.opencode,
      antigravity: options.antigravity,
    };

    for (const [name, enabled] of Object.entries(flagMap)) {
      if (enabled) {
        const agent = getAgentByName(name);
        if (agent) {
          targets.push(agent);
        }
      }
    }
  }

  if (targets.length === 0) {
    console.log("\n  No agent specified. Use one of:");
    console.log("    mcp-lazy add --cursor");
    console.log("    mcp-lazy add --windsurf");
    console.log("    mcp-lazy add --opencode");
    console.log("    mcp-lazy add --antigravity");
    console.log("    mcp-lazy add --all\n");
    process.exit(1);
  }

  console.log("\nRegistering mcp-lazy proxy...\n");

  for (const agent of targets) {
    try {
      const { configPath: agentConfigPath, created } = registerProxy(
        agent,
        configPath
      );
      const action = created ? "created" : "updated";
      const note = agent.note ? ` (${agent.note})` : "";
      console.log(`  ✓ ${agent.displayName}: ${action} ${agentConfigPath}${note}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${agent.displayName}: failed - ${message}`);
    }
  }

  console.log("\n  Done! Restart your agents to activate mcp-lazy.\n");
}

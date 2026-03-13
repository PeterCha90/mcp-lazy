import {
  AGENTS,
  getAgentByName,
  registerProxy,
  type AgentInfo,
} from "../agents/index.js";

const BANNER = `
\x1b[36m\x1b[1m ███╗   ███╗ ██████╗██████╗       ██╗      █████╗ ███████╗██╗   ██╗
 ████╗ ████║██╔════╝██╔══██╗      ██║     ██╔══██╗╚══███╔╝╚██╗ ██╔╝
 ██╔████╔██║██║     ██████╔╝█████╗██║     ███████║  ███╔╝  ╚████╔╝
 ██║╚██╔╝██║██║     ██╔═══╝ ╚════╝██║     ██╔══██║ ███╔╝    ╚██╔╝
 ██║ ╚═╝ ██║╚██████╗██║           ███████╗██║  ██║███████╗   ██║
 ╚═╝     ╚═╝ ╚═════╝╚═╝           ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝\x1b[0m
`;

interface AddOptions {
  cursor?: boolean;
  opencode?: boolean;
  antigravity?: boolean;
  codex?: boolean;
  all?: boolean;
}

export async function runAdd(options: AddOptions): Promise<void> {
  console.log(BANNER);

  // Determine which agents to register
  let targets: AgentInfo[] = [];

  if (options.all) {
    targets = [...AGENTS];
  } else {
    const flagMap: Record<string, boolean | undefined> = {
      cursor: options.cursor,
      opencode: options.opencode,
      antigravity: options.antigravity,
      codex: options.codex,
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
    console.log("  No agent specified. Use one of:");
    console.log("    mcp-lazy add --cursor");
    console.log("    mcp-lazy add --opencode");
    console.log("    mcp-lazy add --antigravity");
    console.log("    mcp-lazy add --codex");
    console.log("    mcp-lazy add --all\n");
    process.exit(1);
  }

  console.log("  Registering mcp-lazy proxy...\n");

  for (const agent of targets) {
    try {
      const { configPath, created, serverCount } = registerProxy(agent);
      const action = created ? "created" : "updated";
      const servers = serverCount > 0 ? ` (${serverCount} servers captured)` : "";
      console.log(`  ✓ ${agent.displayName}: ${action} ${configPath}${servers}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${agent.displayName}: failed - ${message}`);
    }
  }

  console.log("\n  Done! Restart your agents to activate mcp-lazy.\n");
}

import { loadServersBackup } from "../utils/config.js";
import { AGENTS, isProxyRegistered } from "../agents/index.js";

const TOKENS_PER_TOOL = 650;
const PROXY_BASE_TOKENS = 350;

export async function runDoctor(): Promise<void> {
  let hasIssues = false;

  console.log("\nmcp-lazy status check\n");

  // 1. Check Node.js version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  if (major >= 18) {
    console.log(`  ✓ Node.js ${nodeVersion}`);
  } else {
    console.log(`  ✗ Node.js ${nodeVersion} (requires >= 18)`);
    hasIssues = true;
  }

  // 2. Check servers backup
  const servers = loadServersBackup();
  const serverCount = Object.keys(servers).length;

  if (serverCount > 0) {
    const serverNames = Object.keys(servers);
    console.log(`  ✓ ${serverCount} MCP server(s) registered`);
    for (const name of serverNames) {
      console.log(`    - ${name}`);
    }
  } else {
    console.log(`  ✗ No MCP servers registered -> run 'mcp-lazy add --<agent>'`);
    hasIssues = true;
  }

  // 3. Check agent registrations
  console.log("");
  let registeredCount = 0;
  for (const agent of AGENTS) {
    const registered = isProxyRegistered(agent);
    if (registered) {
      console.log(`  ✓ ${agent.displayName} registered`);
      registeredCount++;
    } else {
      console.log(`  - ${agent.displayName} not registered -> mcp-lazy add --${agent.name}`);
    }
  }

  if (registeredCount === 0) {
    console.log("\n  No agents registered. Run 'mcp-lazy add --<agent>' to register.");
    hasIssues = true;
  }

  // 4. Token savings estimation
  if (serverCount > 0) {
    const estimatedTools = serverCount * 15;
    const estimatedTokens = estimatedTools * TOKENS_PER_TOOL;
    const savings = estimatedTokens > 0
      ? Math.round(((estimatedTokens - PROXY_BASE_TOKENS) / estimatedTokens) * 100)
      : 0;

    console.log(`\n  Token savings estimate:`);
    console.log(`    ${serverCount} server(s) registered`);
    console.log(`    Without mcp-lazy: ~${estimatedTokens.toLocaleString()} tokens`);
    console.log(`    With mcp-lazy:     ${PROXY_BASE_TOKENS.toLocaleString()} tokens`);
    console.log(`    Estimated savings: ${savings}%`);
  }

  console.log("");
  if (!hasIssues) {
    console.log("  All checks passed.\n");
  } else {
    console.log("  Some issues found. See above for details.\n");
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to mock modules before importing runDoctor
vi.mock("../agents/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/index.js")>();
  return {
    ...actual,
    isProxyRegistered: vi.fn().mockReturnValue(false),
    AGENTS: actual.AGENTS,
  };
});

import { runDoctor } from "./doctor.js";
import { isProxyRegistered, AGENTS } from "../agents/index.js";

describe("runDoctor", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-test-"));
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleSpy.mockRestore();
    vi.mocked(isProxyRegistered).mockReturnValue(false);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("prints header", async () => {
    await runDoctor();
    expect(consoleSpy).toHaveBeenCalledWith("\nmcp-lazy status check\n");
  });

  it("reports Node.js version check (passes for current runtime)", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const nodeCheck = calls.find((c) => typeof c === "string" && c.includes("Node.js"));
    expect(nodeCheck).toBeDefined();
    // Current runtime should pass (>= 18)
    expect(nodeCheck).toContain("✓");
  });

  it("reports missing mcp-lazy-config.json", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const configCheck = calls.find(
      (c) => typeof c === "string" && c.includes("mcp-lazy-config.json")
    );
    expect(configCheck).toBeDefined();
    expect(configCheck).toContain("✗");
    expect(configCheck).toContain("mcp-lazy init");
  });

  it("reports found mcp-lazy-config.json when present", async () => {
    const configPath = join(tempDir, "mcp-lazy-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: "1.0",
        servers: {
          "test-server": { command: "test", args: [] },
        },
      })
    );

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const configCheck = calls.find(
      (c) => typeof c === "string" && c.includes("mcp-lazy-config.json") && c.includes("found")
    );
    expect(configCheck).toBeDefined();
    expect(configCheck).toContain("✓");
  });

  it("checks each agent registration status", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);

    // Each agent should appear in output
    for (const agent of AGENTS) {
      const agentLine = calls.find(
        (c) => typeof c === "string" && c.includes(agent.displayName)
      );
      expect(agentLine).toBeDefined();
    }
  });

  it("shows registered agent with checkmark", async () => {
    vi.mocked(isProxyRegistered).mockImplementation((agent) => {
      return agent.name === "cursor";
    });

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const cursorLine = calls.find(
      (c) => typeof c === "string" && c.includes("Cursor")
    );
    expect(cursorLine).toContain("✓");
    expect(cursorLine).toContain("registered");
  });

  it("shows unregistered agent with dash", async () => {
    vi.mocked(isProxyRegistered).mockReturnValue(false);

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const cursorLine = calls.find(
      (c) => typeof c === "string" && c.includes("Cursor")
    );
    expect(cursorLine).toContain("-");
    expect(cursorLine).toContain("not registered");
  });

  it("shows token savings when config exists with servers", async () => {
    const configPath = join(tempDir, "mcp-lazy-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: "1.0",
        servers: {
          postgres: { command: "pg-mcp", args: [] },
          redis: { command: "redis-mcp", args: [] },
        },
      })
    );

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const savingsLine = calls.find(
      (c) => typeof c === "string" && c.includes("savings")
    );
    expect(savingsLine).toBeDefined();
  });

  it("reports all checks passed when no issues", async () => {
    const configPath = join(tempDir, "mcp-lazy-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: "1.0",
        servers: { s1: { command: "cmd", args: [] } },
      })
    );
    vi.mocked(isProxyRegistered).mockReturnValue(true);

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const passedLine = calls.find(
      (c) => typeof c === "string" && c.includes("All checks passed")
    );
    expect(passedLine).toBeDefined();
  });

  it("reports issues found when there are problems", async () => {
    // No config file = issue
    vi.mocked(isProxyRegistered).mockReturnValue(false);

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const issuesLine = calls.find(
      (c) => typeof c === "string" && c.includes("issues found")
    );
    expect(issuesLine).toBeDefined();
  });
});

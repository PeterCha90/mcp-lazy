import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runDoctor } from "./doctor.js";
import { AGENTS, isProxyRegistered } from "../agents/index.js";
import { loadServersBackup } from "../utils/config.js";

vi.mock("../agents/index.js", async () => {
  const actual = await vi.importActual("../agents/index.js");
  return {
    ...actual,
    isProxyRegistered: vi.fn().mockReturnValue(false),
  };
});

vi.mock("../utils/config.js", async () => {
  const actual = await vi.importActual("../utils/config.js");
  return {
    ...actual,
    loadServersBackup: vi.fn().mockReturnValue({}),
  };
});

describe("runDoctor", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(loadServersBackup).mockReturnValue({});
    vi.mocked(isProxyRegistered).mockReturnValue(false);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("prints header", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("mcp-lazy status check"))).toBe(true);
  });

  it("reports Node.js version check (passes for current runtime)", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const nodeCheck = calls.find(
      (c) => typeof c === "string" && c.includes("Node.js")
    );
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck).toContain("✓");
  });

  it("reports no servers when backup is empty", async () => {
    vi.mocked(loadServersBackup).mockReturnValue({});

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const serverCheck = calls.find(
      (c) => typeof c === "string" && c.includes("MCP server")
    );
    expect(serverCheck).toBeDefined();
    expect(serverCheck).toContain("✗");
  });

  it("reports servers when backup has entries", async () => {
    vi.mocked(loadServersBackup).mockReturnValue({
      "test-server": { command: "test", args: [] },
    });

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const serverCheck = calls.find(
      (c) => typeof c === "string" && c.includes("MCP server") && c.includes("✓")
    );
    expect(serverCheck).toBeDefined();
  });

  it("checks each agent registration status", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);

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
  });

  it("shows token savings when servers exist", async () => {
    vi.mocked(loadServersBackup).mockReturnValue({
      "test-server": { command: "test", args: [] },
      "other-server": { command: "other", args: [] },
    });

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const tokenLine = calls.find(
      (c) => typeof c === "string" && c.includes("Token savings")
    );
    expect(tokenLine).toBeDefined();
  });

  it("reports all checks passed when no issues", async () => {
    vi.mocked(loadServersBackup).mockReturnValue({
      "s": { command: "c", args: [] },
    });
    vi.mocked(isProxyRegistered).mockReturnValue(true);

    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("All checks passed"))).toBe(true);
  });

  it("reports issues found when there are problems", async () => {
    await runDoctor();
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("issues found"))).toBe(true);
  });
});

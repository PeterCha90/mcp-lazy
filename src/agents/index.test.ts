import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AGENTS,
  getAgentByName,
  registerProxy,
  isProxyRegistered,
  type AgentInfo,
} from "./index.js";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock homedir so saveServersBackup writes to temp dir, not real home
let mockHome = "";

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockHome || actual.homedir(),
  };
});

describe("agents", () => {
  describe("AGENTS array", () => {
    it("contains cursor agent", () => {
      const cursor = AGENTS.find((a) => a.name === "cursor");
      expect(cursor).toBeDefined();
      expect(cursor!.displayName).toBe("Cursor");
      expect(cursor!.configPaths.length).toBeGreaterThan(0);
    });

    it("contains opencode agent", () => {
      const opencode = AGENTS.find((a) => a.name === "opencode");
      expect(opencode).toBeDefined();
      expect(opencode!.displayName).toBe("Opencode");
      expect(opencode!.format).toBe("opencode");
      expect(opencode!.configPaths.some((p) => p.includes("config/opencode"))).toBe(true);
    });

    it("contains antigravity agent", () => {
      const ag = AGENTS.find((a) => a.name === "antigravity");
      expect(ag).toBeDefined();
      expect(ag!.displayName).toBe("Antigravity");
    });

    it("contains codex agent", () => {
      const codex = AGENTS.find((a) => a.name === "codex");
      expect(codex).toBeDefined();
      expect(codex!.displayName).toBe("Codex");
      expect(codex!.format).toBe("toml");
      expect(codex!.configPaths.some((p) => p.includes("config.toml"))).toBe(true);
    });

    it("has at least 4 agents", () => {
      expect(AGENTS.length).toBeGreaterThanOrEqual(4);
    });

    it("every agent has required fields", () => {
      for (const agent of AGENTS) {
        expect(agent.name).toBeTruthy();
        expect(agent.displayName).toBeTruthy();
        expect(agent.configPaths.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getAgentByName", () => {
    it("returns correct agent for known name", () => {
      const cursor = getAgentByName("cursor");
      expect(cursor).toBeDefined();
      expect(cursor!.name).toBe("cursor");
      expect(cursor!.displayName).toBe("Cursor");
    });

    it("returns undefined for unknown name", () => {
      expect(getAgentByName("nonexistent-agent")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(getAgentByName("")).toBeUndefined();
    });

    it("is case-sensitive", () => {
      expect(getAgentByName("Cursor")).toBeUndefined();
      expect(getAgentByName("CURSOR")).toBeUndefined();
    });
  });

  describe("registerProxy", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-test-"));
      mockHome = tempDir;
    });

    afterEach(() => {
      mockHome = "";
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("creates config file with mcp-lazy entry when none exists", () => {
      const configPath = join(tempDir, "mcp.json");
      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(true);
      expect(result.configPath).toBe(configPath);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.mcpServers).toBeDefined();
      expect(written.mcpServers["mcp-lazy"]).toBeDefined();
      expect(written.mcpServers["mcp-lazy"].command).toBe("npx");
      expect(written.mcpServers["mcp-lazy"].args).toContain("mcp-lazy");
    });

    it("replaces existing servers with only mcp-lazy", () => {
      const configPath = join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          "existing-server": {
            command: "existing-cmd",
            args: [],
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(false);
      expect(result.serverCount).toBe(1);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.mcpServers["existing-server"]).toBeUndefined();
      expect(written.mcpServers["mcp-lazy"]).toBeDefined();
    });

    it("creates parent directories when needed", () => {
      const nestedPath = join(tempDir, "deep", "nested", "mcp.json");
      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [nestedPath],
      };

      const result = registerProxy(agent);
      expect(result.created).toBe(true);

      const written = JSON.parse(readFileSync(nestedPath, "utf-8"));
      expect(written.mcpServers["mcp-lazy"]).toBeDefined();
    });

    it("overwrites mcp-lazy entry if already present", () => {
      const configPath = join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          "mcp-lazy": {
            command: "old-npx",
            args: ["old-args"],
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      registerProxy(agent);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.mcpServers["mcp-lazy"].command).toBe("npx");
      expect(written.mcpServers["mcp-lazy"].args).toContain("serve");
    });

    it("creates TOML config file for codex agent", () => {
      const configPath = join(tempDir, "config.toml");
      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(true);
      expect(result.configPath).toBe(configPath);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("[mcp_servers.mcp-lazy]");
      expect(content).toContain('command = "npx"');
      expect(content).toContain("mcp-lazy");
    });

    it("appends TOML block to existing TOML config", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, '[other_section]\nkey = "value"\n');

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(false);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain('[other_section]');
      expect(content).toContain("[mcp_servers.mcp-lazy]");
    });

    it("extracts and backs up existing TOML servers", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(
        configPath,
        '[mcp_servers.my-server]\ncommand = "my-cmd"\nargs = ["--flag"]\n'
      );

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      expect(result.serverCount).toBe(1);

      const content = readFileSync(configPath, "utf-8");
      expect(content).not.toContain("[mcp_servers.my-server]");
      expect(content).toContain("[mcp_servers.mcp-lazy]");
    });

    it("is idempotent when run multiple times on TOML", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, '[other_section]\nkey = "value"\n');

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      registerProxy(agent);
      registerProxy(agent);

      const content = readFileSync(configPath, "utf-8");
      const occurrences = content.split("[mcp_servers.mcp-lazy]").length - 1;
      expect(occurrences).toBe(1);
      expect(content).toContain("[other_section]");
    });

    it("removes old mcp_servers sections from TOML but preserves other sections", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(
        configPath,
        '[settings]\nmodel = "gpt-4"\n\n[mcp_servers.postgres]\ncommand = "pg-mcp"\nargs = []\n\n[mcp_servers.redis]\ncommand = "redis-mcp"\nargs = ["--port", "6379"]\n'
      );

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      expect(result.serverCount).toBe(2);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("[settings]");
      expect(content).toContain('model = "gpt-4"');
      expect(content).not.toContain("[mcp_servers.postgres]");
      expect(content).not.toContain("[mcp_servers.redis]");
      expect(content).toContain("[mcp_servers.mcp-lazy]");
    });

    it("creates opencode config file with mcp-lazy entry when none exists", () => {
      const configDir = join(tempDir, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, "config.json");
      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(true);
      expect(result.configPath).toBe(configPath);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.mcp).toBeDefined();
      expect(written.mcp["mcp-lazy"]).toBeDefined();
      expect(written.mcp["mcp-lazy"].type).toBe("local");
      expect(written.mcp["mcp-lazy"].command).toEqual(["npx", "-y", "mcp-lazy", "serve"]);
    });

    it("replaces existing opencode servers with only mcp-lazy", () => {
      const configDir = join(tempDir, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, "config.json");
      const existingConfig = {
        "$schema": "https://opencode.ai/config.json",
        mcp: {
          "local-server": {
            type: "local",
            command: ["npx", "-y", "@modelcontextprotocol/server-everything"],
            environment: { MY_ENV_VAR: "value" },
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      const result = registerProxy(agent);

      expect(result.created).toBe(false);
      expect(result.serverCount).toBe(1);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      // Preserves non-mcp keys
      expect(written["$schema"]).toBe("https://opencode.ai/config.json");
      // Replaces mcp section
      expect(written.mcp["local-server"]).toBeUndefined();
      expect(written.mcp["mcp-lazy"]).toBeDefined();
      expect(written.mcp["mcp-lazy"].type).toBe("local");
    });

    it("preserves non-mcp keys in opencode config", () => {
      const configDir = join(tempDir, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, "config.json");
      const existingConfig = {
        "$schema": "https://opencode.ai/config.json",
        model: "claude-sonnet",
        mcp: {
          "my-server": {
            type: "local",
            command: ["my-cmd"],
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      registerProxy(agent);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written["$schema"]).toBe("https://opencode.ai/config.json");
      expect(written.model).toBe("claude-sonnet");
      expect(written.mcp["mcp-lazy"]).toBeDefined();
    });

    it("handles corrupt existing file gracefully", () => {
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(configPath, "not valid json {{{");

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      const result = registerProxy(agent);
      expect(result.created).toBe(false);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.mcpServers["mcp-lazy"]).toBeDefined();
    });

    it("converts url-based TOML servers to mcp-remote and backs them up", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, `[mcp_servers.linear]\nurl = "https://mcp.linear.app/mcp"\n`);

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      // URL servers are now counted (converted to mcp-remote)
      expect(result.serverCount).toBe(1);

      const content = readFileSync(configPath, "utf-8");
      // URL server is NOT preserved in config
      expect(content).not.toContain("[mcp_servers.linear]");
      // Proxy is added
      expect(content).toContain("[mcp_servers.mcp-lazy]");

      // Backup contains mcp-remote converted entry
      const backupPath = join(tempDir, ".mcp-lazy", "servers.json");
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      expect(backup.servers["linear"]).toBeDefined();
      expect(backup.servers["linear"].command).toBe("npx");
      expect(backup.servers["linear"].args).toContain("mcp-remote");
      expect(backup.servers["linear"].args).toContain("https://mcp.linear.app/mcp");
    });

    it("converts url-based JSON servers to mcp-remote and removes them from config", () => {
      const configPath = join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          "stdio-server": { command: "some-cmd", args: ["--flag"] },
          "notion": { serverUrl: "https://mcp.notion.so/mcp", headers: { "Authorization": "Bearer token" } },
          "linear": { url: "https://mcp.linear.app/mcp" },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      const result = registerProxy(agent);

      // ALL servers are counted (stdio + URL converted to mcp-remote)
      expect(result.serverCount).toBe(3);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      // ALL original servers removed
      expect(written.mcpServers["stdio-server"]).toBeUndefined();
      expect(written.mcpServers["notion"]).toBeUndefined();
      expect(written.mcpServers["linear"]).toBeUndefined();
      // Only proxy remains
      expect(Object.keys(written.mcpServers)).toEqual(["mcp-lazy"]);
      expect(written.mcpServers["mcp-lazy"]).toBeDefined();
    });

    it("backs up both stdio and url servers (url as mcp-remote) in JSON config", () => {
      const configPath = join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          "stdio-server": { command: "some-cmd", args: [] },
          "url-server": { url: "https://example.com/mcp" },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      registerProxy(agent);

      // Check backup contains both servers
      const backupPath = join(tempDir, ".mcp-lazy", "servers.json");
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      expect(backup.servers["stdio-server"]).toBeDefined();
      expect(backup.servers["stdio-server"].command).toBe("some-cmd");
      // URL server is backed up as mcp-remote
      expect(backup.servers["url-server"]).toBeDefined();
      expect(backup.servers["url-server"].command).toBe("npx");
      expect(backup.servers["url-server"].args).toContain("mcp-remote");
      expect(backup.servers["url-server"].args).toContain("https://example.com/mcp");
    });

    it("converts remote opencode servers to mcp-remote and removes them from config", () => {
      const configDir = join(tempDir, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, "config.json");
      const existingConfig = {
        "$schema": "https://opencode.ai/config.json",
        mcp: {
          "local-server": {
            type: "local",
            command: ["npx", "-y", "@modelcontextprotocol/server-everything"],
          },
          "remote-server": {
            type: "remote",
            url: "https://mcp.example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      const result = registerProxy(agent);

      // ALL servers are counted (local + remote converted to mcp-remote)
      expect(result.serverCount).toBe(2);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      // ALL original servers removed
      expect(written.mcp["local-server"]).toBeUndefined();
      expect(written.mcp["remote-server"]).toBeUndefined();
      // Only proxy remains
      expect(Object.keys(written.mcp)).toEqual(["mcp-lazy"]);
      expect(written.mcp["mcp-lazy"]).toBeDefined();
    });

    it("converts TOML url servers with http_headers to mcp-remote and removes them", () => {
      const configPath = join(tempDir, "config.toml");
      const toml = `[mcp_servers.postgres]\ncommand = "pg-mcp"\nargs = []\n\n[mcp_servers.figma]\nurl = "https://mcp.figma.com/mcp"\n\n[mcp_servers.figma.http_headers]\nX-Figma-Region = "us-east-1"\n`;
      writeFileSync(configPath, toml);

      const agent: AgentInfo = {
        name: "codex",
        displayName: "Codex",
        configPaths: [configPath],
        format: "toml",
      };

      const result = registerProxy(agent);

      // ALL servers counted (stdio + URL converted to mcp-remote)
      expect(result.serverCount).toBe(2);

      const content = readFileSync(configPath, "utf-8");
      // ALL original servers removed
      expect(content).not.toContain("[mcp_servers.postgres]");
      expect(content).not.toContain("[mcp_servers.figma]");
      expect(content).not.toContain("[mcp_servers.figma.http_headers]");
      // Proxy added
      expect(content).toContain("[mcp_servers.mcp-lazy]");

      // Backup contains mcp-remote converted entries
      const backupPath = join(tempDir, ".mcp-lazy", "servers.json");
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      expect(backup.servers["postgres"]).toBeDefined();
      expect(backup.servers["postgres"].command).toBe("pg-mcp");
      expect(backup.servers["figma"]).toBeDefined();
      expect(backup.servers["figma"].command).toBe("npx");
      expect(backup.servers["figma"].args).toContain("mcp-remote");
      expect(backup.servers["figma"].args).toContain("https://mcp.figma.com/mcp");
      expect(backup.servers["figma"].args).toContain("--header");
      expect(backup.servers["figma"].args).toContain("X-Figma-Region:us-east-1");
    });
    it("converts url-based JSON server with headers to mcp-remote with --header flags", () => {
      const configPath = join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          "notion": {
            serverUrl: "https://mcp.notion.com/mcp",
            headers: { "Authorization": "Bearer token123" },
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(existingConfig));

      const agent: AgentInfo = {
        name: "test-agent",
        displayName: "Test Agent",
        configPaths: [configPath],
      };

      const result = registerProxy(agent);

      expect(result.serverCount).toBe(1);

      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      // Only mcp-lazy in config
      expect(Object.keys(written.mcpServers)).toEqual(["mcp-lazy"]);

      // Backup contains mcp-remote with --header flags
      const backupPath = join(tempDir, ".mcp-lazy", "servers.json");
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      expect(backup.servers["notion"]).toBeDefined();
      expect(backup.servers["notion"].command).toBe("npx");
      expect(backup.servers["notion"].args).toEqual([
        "-y", "mcp-remote", "https://mcp.notion.com/mcp",
        "--header", "Authorization:Bearer token123",
      ]);
    });
  });

  describe("isProxyRegistered", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns true when mcp-lazy is registered", () => {
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            "mcp-lazy": { command: "npx", args: ["mcp-lazy", "serve"] },
          },
        })
      );

      const agent: AgentInfo = {
        name: "test",
        displayName: "Test",
        configPaths: [configPath],
      };

      expect(isProxyRegistered(agent)).toBe(true);
    });

    it("returns false when config exists but mcp-lazy is not registered", () => {
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            "other-server": { command: "other", args: [] },
          },
        })
      );

      const agent: AgentInfo = {
        name: "test",
        displayName: "Test",
        configPaths: [configPath],
      };

      expect(isProxyRegistered(agent)).toBe(false);
    });

    it("returns false when config file does not exist", () => {
      const agent: AgentInfo = {
        name: "test",
        displayName: "Test",
        configPaths: [join(tempDir, "nonexistent.json")],
      };

      expect(isProxyRegistered(agent)).toBe(false);
    });

    it("returns false when config file is invalid JSON", () => {
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(configPath, "invalid json");

      const agent: AgentInfo = {
        name: "test",
        displayName: "Test",
        configPaths: [configPath],
      };

      expect(isProxyRegistered(agent)).toBe(false);
    });

    it("returns true for opencode format when mcp-lazy is registered", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcp: {
            "mcp-lazy": { type: "local", command: ["npx", "-y", "mcp-lazy", "serve"] },
          },
        })
      );

      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      expect(isProxyRegistered(agent)).toBe(true);
    });

    it("returns false for opencode format when mcp-lazy is not registered", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcp: {
            "other-server": { type: "local", command: ["other"] },
          },
        })
      );

      const agent: AgentInfo = {
        name: "opencode",
        displayName: "Opencode",
        configPaths: [configPath],
        format: "opencode",
      };

      expect(isProxyRegistered(agent)).toBe(false);
    });

    it("returns false when mcpServers key is missing", () => {
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(configPath, JSON.stringify({ other: "data" }));

      const agent: AgentInfo = {
        name: "test",
        displayName: "Test",
        configPaths: [configPath],
      };

      expect(isProxyRegistered(agent)).toBe(false);
    });
  });
});

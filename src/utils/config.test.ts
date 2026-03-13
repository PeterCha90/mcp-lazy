import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Use a global variable that vi.mock can access
let mockHome = "";

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockHome || actual.homedir(),
  };
});

describe("config", () => {
  beforeEach(() => {
    mockHome = mkdtempSync(join(tmpdir(), "mcp-lazy-home-"));
  });

  afterEach(() => {
    if (mockHome) {
      rmSync(mockHome, { recursive: true, force: true });
    }
  });

  describe("saveServersBackup / loadServersBackup", () => {
    it("saves and loads servers", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({ "test-server": { command: "test", args: ["--flag"] } });
      const loaded = loadServersBackup();

      expect(loaded["test-server"]).toBeDefined();
      expect(loaded["test-server"].command).toBe("test");
      expect(loaded["test-server"].args).toEqual(["--flag"]);
    });

    it("merges with existing backup", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({ s1: { command: "cmd1", args: [] } });
      saveServersBackup({ s2: { command: "cmd2", args: [] } });

      const loaded = loadServersBackup();
      expect(Object.keys(loaded)).toHaveLength(2);
    });

    it("overwrites existing server with same name", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({ s1: { command: "old", args: [] } });
      saveServersBackup({ s1: { command: "new", args: ["--new"] } });

      const loaded = loadServersBackup();
      expect(loaded["s1"].command).toBe("new");
    });

    it("filters out mcp-lazy from backup", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({
        "real-server": { command: "real", args: [] },
        "mcp-lazy": { command: "npx", args: ["mcp-lazy", "serve"] },
      });

      const loaded = loadServersBackup();
      expect(loaded["real-server"]).toBeDefined();
      expect(loaded["mcp-lazy"]).toBeUndefined();
    });

    it("returns empty object when no backup exists", async () => {
      // Use a fresh mockHome with no prior data
      const freshHome = mkdtempSync(join(tmpdir(), "mcp-lazy-fresh-"));
      mockHome = freshHome;
      const { loadServersBackup } = await import("./config.js");
      const loaded = loadServersBackup();
      expect(loaded).toEqual({});
      rmSync(freshHome, { recursive: true, force: true });
    });

    it("preserves env and description fields", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({
        s1: { command: "cmd", args: [], env: { KEY: "val" }, description: "My server" },
      });

      const loaded = loadServersBackup();
      expect(loaded["s1"].env).toEqual({ KEY: "val" });
      expect(loaded["s1"].description).toBe("My server");
    });

    it("creates ~/.mcp-lazy directory if needed", async () => {
      const freshHome = mkdtempSync(join(tmpdir(), "mcp-lazy-dir-"));
      mockHome = freshHome;
      const { saveServersBackup } = await import("./config.js");
      const dir = resolve(freshHome, ".mcp-lazy");
      expect(existsSync(dir)).toBe(false);

      saveServersBackup({ s1: { command: "cmd", args: [] } });
      expect(existsSync(dir)).toBe(true);
      rmSync(freshHome, { recursive: true, force: true });
    });

    it("handles corrupt backup file gracefully", async () => {
      const freshHome = mkdtempSync(join(tmpdir(), "mcp-lazy-corrupt-"));
      mockHome = freshHome;
      const { loadServersBackup } = await import("./config.js");
      const dir = resolve(freshHome, ".mcp-lazy");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "servers.json"), "not valid json");

      const loaded = loadServersBackup();
      expect(loaded).toEqual({});
      rmSync(freshHome, { recursive: true, force: true });
    });

    it("preserves url field in backup", async () => {
      const { saveServersBackup, loadServersBackup } = await import("./config.js");

      saveServersBackup({ linear: { url: "https://mcp.linear.app/mcp", args: [] } });
      const loaded = loadServersBackup();

      expect(loaded["linear"]).toBeDefined();
      expect(loaded["linear"].url).toBe("https://mcp.linear.app/mcp");
    });
  });

  describe("extractServersFromConfig", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-extract-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("extracts servers from valid config", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          postgres: { command: "pg-mcp", args: ["--host", "localhost"] },
          redis: { command: "redis-mcp", args: [] },
        },
      }));

      const servers = extractServersFromConfig(configPath);
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers["postgres"].command).toBe("pg-mcp");
    });

    it("filters out mcp-lazy entry", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          postgres: { command: "pg-mcp", args: [] },
          "mcp-lazy": { command: "npx", args: ["mcp-lazy", "serve"] },
        },
      }));

      const servers = extractServersFromConfig(configPath);
      expect(servers["postgres"]).toBeDefined();
      expect(servers["mcp-lazy"]).toBeUndefined();
    });

    it("returns empty for nonexistent file", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const servers = extractServersFromConfig(join(tempDir, "nope.json"));
      expect(servers).toEqual({});
    });

    it("returns empty for invalid JSON", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "bad.json");
      writeFileSync(configPath, "not json");

      const servers = extractServersFromConfig(configPath);
      expect(servers).toEqual({});
    });

    it("returns empty for wrong schema", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "bad.json");
      writeFileSync(configPath, JSON.stringify({ other: "data" }));

      const servers = extractServersFromConfig(configPath);
      expect(servers).toEqual({});
    });

    it("extracts serverUrl-based servers from JSON config", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            linear: { serverUrl: "https://mcp.linear.app/mcp" },
          },
        })
      );

      const result = extractServersFromConfig(configPath);
      expect(result["linear"]).toBeDefined();
      expect(result["linear"].url).toBe("https://mcp.linear.app/mcp");
      expect((result["linear"] as any).serverUrl).toBeUndefined();
    });

    it("extracts url-based servers from JSON config", async () => {
      const { extractServersFromConfig } = await import("./config.js");
      const configPath = join(tempDir, "mcp.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            linear: { url: "https://mcp.linear.app/mcp" },
            postgres: { command: "pg-mcp", args: [] },
          },
        })
      );

      const servers = extractServersFromConfig(configPath);
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers["linear"]).toBeDefined();
      expect(servers["linear"].url).toBe("https://mcp.linear.app/mcp");
      expect(servers["postgres"]).toBeDefined();
      expect(servers["postgres"].command).toBe("pg-mcp");
    });
  });

  describe("extractServersFromToml", () => {
    it("extracts servers from valid TOML", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[mcp_servers.postgres]
command = "pg-mcp"
args = ["--host", "localhost"]

[mcp_servers.redis]
command = "redis-mcp"
args = []
`;
      const servers = extractServersFromToml(toml);
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers["postgres"].command).toBe("pg-mcp");
      expect(servers["postgres"].args).toEqual(["--host", "localhost"]);
      expect(servers["redis"].command).toBe("redis-mcp");
      expect(servers["redis"].args).toEqual([]);
    });

    it("filters out mcp-lazy", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[mcp_servers.mcp-lazy]
command = "npx"
args = ["-y", "mcp-lazy", "serve"]

[mcp_servers.postgres]
command = "pg-mcp"
args = ["--host", "localhost"]
`;
      const servers = extractServersFromToml(toml);
      expect(servers["postgres"]).toBeDefined();
      expect(servers["mcp-lazy"]).toBeUndefined();
    });

    it("returns empty for no mcp_servers sections", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[settings]
theme = "dark"

[other]
key = "value"
`;
      const servers = extractServersFromToml(toml);
      expect(servers).toEqual({});
    });

    it("returns empty for empty string", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const servers = extractServersFromToml("");
      expect(servers).toEqual({});
    });

    it("handles TOML with other sections mixed in", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[settings]
theme = "dark"

[mcp_servers.my-tool]
command = "my-tool-cmd"
args = ["--verbose"]

[other_section]
foo = "bar"
`;
      const servers = extractServersFromToml(toml);
      expect(Object.keys(servers)).toHaveLength(1);
      expect(servers["my-tool"].command).toBe("my-tool-cmd");
      expect(servers["my-tool"].args).toEqual(["--verbose"]);
    });

    it("handles args with multiple values", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[mcp_servers.lazy]
command = "npx"
args = ["-y", "mcp-lazy", "serve"]
`;
      const servers = extractServersFromToml(toml);
      expect(servers["lazy"].command).toBe("npx");
      expect(servers["lazy"].args).toEqual(["-y", "mcp-lazy", "serve"]);
    });

    it("extracts serverUrl-based servers from TOML", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `[mcp_servers.linear]\nserverUrl = "https://mcp.linear.app/mcp"\n`;
      const result = extractServersFromToml(toml);
      expect(result["linear"]).toBeDefined();
      expect(result["linear"].url).toBe("https://mcp.linear.app/mcp");
    });

    it("extracts url-based servers from TOML", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `[mcp_servers.linear]\nurl = "https://mcp.linear.app/mcp"\n`;
      const result = extractServersFromToml(toml);
      expect(result["linear"]).toBeDefined();
      expect(result["linear"].url).toBe("https://mcp.linear.app/mcp");
      expect(result["linear"].command).toBeUndefined();
    });

    it("extracts http_headers from TOML", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

[mcp_servers.figma.http_headers]
X-Figma-Region = "us-east-1"
X-Custom-Header = "my-value"
`;
      const servers = extractServersFromToml(toml);
      expect(servers["figma"]).toBeDefined();
      expect(servers["figma"].url).toBe("https://mcp.figma.com/mcp");
      expect(servers["figma"].headers).toEqual({
        "X-Figma-Region": "us-east-1",
        "X-Custom-Header": "my-value",
      });
    });

    it("extracts mixed stdio and url servers from TOML", async () => {
      const { extractServersFromToml } = await import("./config.js");
      const toml = `[mcp_servers.linear]\nurl = "https://mcp.linear.app/mcp"\n\n[mcp_servers.postgres]\ncommand = "pg-mcp"\nargs = ["--host", "localhost"]\n`;
      const result = extractServersFromToml(toml);
      expect(result["linear"]).toBeDefined();
      expect(result["linear"].url).toBe("https://mcp.linear.app/mcp");
      expect(result["postgres"]).toBeDefined();
      expect(result["postgres"].command).toBe("pg-mcp");
    });
  });

  describe("convertUrlToMcpRemote", () => {
    it("converts url to mcp-remote command", async () => {
      const { convertUrlToMcpRemote } = await import("./config.js");
      const result = convertUrlToMcpRemote("https://mcp.linear.app/mcp");
      expect(result.command).toBe("npx");
      expect(result.args).toEqual(["-y", "mcp-remote", "https://mcp.linear.app/mcp"]);
    });

    it("includes --header flags for headers", async () => {
      const { convertUrlToMcpRemote } = await import("./config.js");
      const result = convertUrlToMcpRemote("https://mcp.notion.com/mcp", {
        "Authorization": "Bearer token123",
      });
      expect(result.command).toBe("npx");
      expect(result.args).toEqual([
        "-y", "mcp-remote", "https://mcp.notion.com/mcp",
        "--header", "Authorization:Bearer token123",
      ]);
    });

    it("handles multiple headers", async () => {
      const { convertUrlToMcpRemote } = await import("./config.js");
      const result = convertUrlToMcpRemote("https://example.com/mcp", {
        "Authorization": "Bearer abc",
        "X-Custom": "value",
      });
      expect(result.command).toBe("npx");
      expect(result.args).toContain("-y");
      expect(result.args).toContain("mcp-remote");
      expect(result.args).toContain("https://example.com/mcp");
      // Two --header pairs
      const headerIndices = result.args!.reduce<number[]>((acc, arg, i) => {
        if (arg === "--header") acc.push(i);
        return acc;
      }, []);
      expect(headerIndices).toHaveLength(2);
      expect(result.args![headerIndices[0] + 1]).toBe("Authorization:Bearer abc");
      expect(result.args![headerIndices[1] + 1]).toBe("X-Custom:value");
    });
  });

  describe("extractServersFromOpencodeConfig", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-opencode-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("extracts local servers from opencode config", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, JSON.stringify({
        mcp: {
          "local-server": {
            type: "local",
            command: ["npx", "-y", "@modelcontextprotocol/server-everything"],
            environment: { MY_ENV_VAR: "value" },
          },
        },
      }));

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(Object.keys(servers)).toHaveLength(1);
      expect(servers["local-server"].command).toBe("npx");
      expect(servers["local-server"].args).toEqual(["-y", "@modelcontextprotocol/server-everything"]);
      expect(servers["local-server"].env).toEqual({ MY_ENV_VAR: "value" });
    });

    it("extracts remote servers from opencode config", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, JSON.stringify({
        mcp: {
          "remote-server": {
            type: "remote",
            url: "https://mcp.example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      }));

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(Object.keys(servers)).toHaveLength(1);
      expect(servers["remote-server"].url).toBe("https://mcp.example.com/mcp");
      expect(servers["remote-server"].headers).toEqual({ Authorization: "Bearer token" });
    });

    it("filters out mcp-lazy", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, JSON.stringify({
        mcp: {
          "mcp-lazy": { type: "local", command: ["npx", "-y", "mcp-lazy", "serve"] },
          "real-server": { type: "local", command: ["real-cmd", "--flag"] },
        },
      }));

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(servers["mcp-lazy"]).toBeUndefined();
      expect(servers["real-server"]).toBeDefined();
    });

    it("returns empty for nonexistent file", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const servers = extractServersFromOpencodeConfig(join(tempDir, "nope.json"));
      expect(servers).toEqual({});
    });

    it("returns empty for config without mcp section", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ "$schema": "https://opencode.ai/config.json" }));

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(servers).toEqual({});
    });

    it("returns empty for invalid JSON", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, "not json");

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(servers).toEqual({});
    });

    it("extracts mixed local and remote servers", async () => {
      const { extractServersFromOpencodeConfig } = await import("./config.js");
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, JSON.stringify({
        mcp: {
          "local-server": { type: "local", command: ["my-cmd", "--flag"] },
          "remote-server": { type: "remote", url: "https://example.com/mcp" },
        },
      }));

      const servers = extractServersFromOpencodeConfig(configPath);
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers["local-server"].command).toBe("my-cmd");
      expect(servers["remote-server"].url).toBe("https://example.com/mcp");
    });
  });
});

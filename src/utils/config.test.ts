import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadLazyConfig, mergeServerConfigs, type ServerConfig } from "./config.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mcp-lazy-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadLazyConfig", () => {
    it("loads a valid config file", () => {
      const configPath = join(tempDir, "mcp-lazy-config.json");
      const configData = {
        version: "1.0",
        servers: {
          "my-server": {
            command: "node",
            args: ["server.js"],
            description: "My test server",
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(configData));

      const config = loadLazyConfig(configPath);
      expect(config.version).toBe("1.0");
      expect(config.servers["my-server"]).toBeDefined();
      expect(config.servers["my-server"].command).toBe("node");
      expect(config.servers["my-server"].args).toEqual(["server.js"]);
      expect(config.servers["my-server"].description).toBe("My test server");
    });

    it("applies default version when not specified", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: {
            s1: { command: "echo", args: [] },
          },
        })
      );

      const config = loadLazyConfig(configPath);
      expect(config.version).toBe("1.0");
    });

    it("applies default empty args when not specified", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: {
            s1: { command: "echo" },
          },
        })
      );

      const config = loadLazyConfig(configPath);
      expect(config.servers["s1"].args).toEqual([]);
    });

    it("loads config with env vars", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: {
            s1: {
              command: "node",
              args: ["index.js"],
              env: { API_KEY: "secret123", PORT: "3000" },
            },
          },
        })
      );

      const config = loadLazyConfig(configPath);
      expect(config.servers["s1"].env).toEqual({
        API_KEY: "secret123",
        PORT: "3000",
      });
    });

    it("loads config with multiple servers", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          version: "1.0",
          servers: {
            postgres: { command: "pg-mcp", args: ["--host", "localhost"] },
            redis: { command: "redis-mcp", args: [] },
            slack: { command: "slack-mcp", args: ["--token", "xyz"] },
          },
        })
      );

      const config = loadLazyConfig(configPath);
      expect(Object.keys(config.servers)).toHaveLength(3);
      expect(config.servers["postgres"].command).toBe("pg-mcp");
      expect(config.servers["redis"].command).toBe("redis-mcp");
      expect(config.servers["slack"].command).toBe("slack-mcp");
    });

    it("throws on invalid config (missing command)", () => {
      const configPath = join(tempDir, "bad.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: {
            s1: { args: ["test"] }, // missing required 'command'
          },
        })
      );

      expect(() => loadLazyConfig(configPath)).toThrow();
    });

    it("throws on completely invalid structure", () => {
      const configPath = join(tempDir, "bad.json");
      writeFileSync(configPath, JSON.stringify({ invalid: true }));

      expect(() => loadLazyConfig(configPath)).toThrow();
    });

    it("throws on invalid JSON", () => {
      const configPath = join(tempDir, "bad.json");
      writeFileSync(configPath, "not json at all {{{");

      expect(() => loadLazyConfig(configPath)).toThrow();
    });

    it("throws when file does not exist", () => {
      expect(() => loadLazyConfig(join(tempDir, "nonexistent.json"))).toThrow();
    });
  });

  describe("mergeServerConfigs", () => {
    it("merges servers from multiple config sources", () => {
      const configs = [
        {
          path: "/a/.mcp.json",
          servers: {
            postgres: { command: "pg-mcp", args: [] } as ServerConfig,
          },
        },
        {
          path: "/b/.mcp.json",
          servers: {
            redis: { command: "redis-mcp", args: [] } as ServerConfig,
          },
        },
      ];

      const merged = mergeServerConfigs(configs);
      expect(Object.keys(merged)).toHaveLength(2);
      expect(merged["postgres"]).toBeDefined();
      expect(merged["redis"]).toBeDefined();
    });

    it("later configs override earlier ones for same server name", () => {
      const configs = [
        {
          path: "/a/.mcp.json",
          servers: {
            myserver: { command: "old-cmd", args: ["--old"] } as ServerConfig,
          },
        },
        {
          path: "/b/.mcp.json",
          servers: {
            myserver: { command: "new-cmd", args: ["--new"] } as ServerConfig,
          },
        },
      ];

      const merged = mergeServerConfigs(configs);
      expect(merged["myserver"].command).toBe("new-cmd");
      expect(merged["myserver"].args).toEqual(["--new"]);
    });

    it("returns empty object for empty input", () => {
      const merged = mergeServerConfigs([]);
      expect(merged).toEqual({});
    });

    it("handles single config source", () => {
      const configs = [
        {
          path: "/a/.mcp.json",
          servers: {
            s1: { command: "cmd1", args: [] } as ServerConfig,
            s2: { command: "cmd2", args: ["--flag"] } as ServerConfig,
          },
        },
      ];

      const merged = mergeServerConfigs(configs);
      expect(Object.keys(merged)).toHaveLength(2);
      expect(merged["s1"].command).toBe("cmd1");
      expect(merged["s2"].command).toBe("cmd2");
    });

    it("preserves env and description fields", () => {
      const configs = [
        {
          path: "/a/.mcp.json",
          servers: {
            s1: {
              command: "cmd",
              args: [],
              env: { KEY: "val" },
              description: "My server",
            } as ServerConfig,
          },
        },
      ];

      const merged = mergeServerConfigs(configs);
      expect(merged["s1"].env).toEqual({ KEY: "val" });
      expect(merged["s1"].description).toBe("My server");
    });
  });
});

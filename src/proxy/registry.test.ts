import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry, extractKeywords, type ToolEntry } from "./registry.js";

function makeTool(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name: overrides.name ?? "test_tool",
    description: overrides.description ?? "A test tool",
    server: overrides.server ?? "test-server",
    serverDescription: overrides.serverDescription ?? "A test server",
    inputSchema: overrides.inputSchema ?? { type: "object" },
    keywords: overrides.keywords ?? ["test", "tool"],
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("addTool / addTools", () => {
    it("adds a single tool", () => {
      registry.addTool(makeTool());
      expect(registry.getToolCount()).toBe(1);
    });

    it("adds multiple tools at once", () => {
      registry.addTools([
        makeTool({ name: "tool_a" }),
        makeTool({ name: "tool_b" }),
        makeTool({ name: "tool_c" }),
      ]);
      expect(registry.getToolCount()).toBe(3);
    });

    it("accumulates tools across multiple calls", () => {
      registry.addTool(makeTool({ name: "tool_a" }));
      registry.addTools([makeTool({ name: "tool_b" }), makeTool({ name: "tool_c" })]);
      expect(registry.getToolCount()).toBe(3);
    });
  });

  describe("getToolCount", () => {
    it("returns 0 for empty registry", () => {
      expect(registry.getToolCount()).toBe(0);
    });

    it("returns correct count after adding tools", () => {
      registry.addTools([makeTool(), makeTool(), makeTool()]);
      expect(registry.getToolCount()).toBe(3);
    });
  });

  describe("getServerNames", () => {
    it("returns empty array for empty registry", () => {
      expect(registry.getServerNames()).toEqual([]);
    });

    it("returns unique server names", () => {
      registry.addTools([
        makeTool({ server: "server-a" }),
        makeTool({ server: "server-b" }),
        makeTool({ server: "server-a" }),
      ]);
      const names = registry.getServerNames();
      expect(names).toHaveLength(2);
      expect(names).toContain("server-a");
      expect(names).toContain("server-b");
    });
  });

  describe("getToolsByServer", () => {
    it("returns only tools for the given server", () => {
      registry.addTools([
        makeTool({ name: "tool_a", server: "alpha" }),
        makeTool({ name: "tool_b", server: "beta" }),
        makeTool({ name: "tool_c", server: "alpha" }),
      ]);
      const alphaTools = registry.getToolsByServer("alpha");
      expect(alphaTools).toHaveLength(2);
      expect(alphaTools.map((t) => t.name)).toEqual(["tool_a", "tool_c"]);
    });

    it("returns empty array for unknown server", () => {
      registry.addTool(makeTool({ server: "alpha" }));
      expect(registry.getToolsByServer("unknown")).toEqual([]);
    });
  });

  describe("findTool", () => {
    it("finds a tool by name and server", () => {
      registry.addTools([
        makeTool({ name: "read_file", server: "fs-server" }),
        makeTool({ name: "read_file", server: "other-server" }),
      ]);
      const found = registry.findTool("read_file", "fs-server");
      expect(found).toBeDefined();
      expect(found!.server).toBe("fs-server");
    });

    it("returns undefined when tool name matches but server does not", () => {
      registry.addTool(makeTool({ name: "read_file", server: "fs-server" }));
      expect(registry.findTool("read_file", "wrong-server")).toBeUndefined();
    });

    it("returns undefined for nonexistent tool", () => {
      expect(registry.findTool("nope", "nope")).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all tools", () => {
      registry.addTools([makeTool(), makeTool()]);
      registry.clear();
      expect(registry.getToolCount()).toBe(0);
    });
  });

  describe("search", () => {
    it("returns exact name match with score 1.0+", () => {
      registry.addTool(
        makeTool({ name: "query_database", description: "Run a SQL query" })
      );
      const results = registry.search("query_database");
      expect(results).toHaveLength(1);
      expect(results[0].tool_name).toBe("query_database");
      // exact name match = 1.0, plus description/keyword bonuses
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(1.0);
    });

    it("returns partial name match with score including 0.8", () => {
      registry.addTool(
        makeTool({
          name: "query_database",
          description: "Executes queries",
          serverDescription: "",
          keywords: [],
        })
      );
      const results = registry.search("query");
      expect(results).toHaveLength(1);
      expect(results[0].tool_name).toBe("query_database");
      // partial name match = 0.8, plus description bonus for "query"
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(0.8);
    });

    it("matches on description keywords", () => {
      registry.addTool(
        makeTool({
          name: "xyz_tool",
          description: "Send an email notification to users",
          serverDescription: "",
          keywords: [],
        })
      );
      const results = registry.search("email");
      expect(results).toHaveLength(1);
      expect(results[0].tool_name).toBe("xyz_tool");
      // description match = 0.6
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(0.6);
    });

    it("matches on server description", () => {
      registry.addTool(
        makeTool({
          name: "do_something",
          description: "Does something",
          serverDescription: "PostgreSQL database management tools",
          keywords: [],
        })
      );
      const results = registry.search("postgresql");
      expect(results).toHaveLength(1);
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(0.4);
    });

    it("matches on keywords", () => {
      registry.addTool(
        makeTool({
          name: "xyz",
          description: "does xyz",
          serverDescription: "",
          keywords: ["filesystem", "read", "write"],
        })
      );
      const results = registry.search("filesystem");
      expect(results).toHaveLength(1);
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(0.3);
    });

    it("returns empty array when no tools match", () => {
      registry.addTool(makeTool({ name: "read_file", description: "Read a file" }));
      const results = registry.search("zzzznotfound");
      expect(results).toEqual([]);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        registry.addTool(
          makeTool({
            name: `tool_${i}`,
            description: "common keyword shared",
            keywords: ["shared"],
          })
        );
      }
      const results = registry.search("shared", 3);
      expect(results).toHaveLength(3);
    });

    it("defaults to limit of 5", () => {
      for (let i = 0; i < 10; i++) {
        registry.addTool(
          makeTool({
            name: `tool_${i}`,
            description: "common keyword shared",
            keywords: ["shared"],
          })
        );
      }
      const results = registry.search("shared");
      expect(results).toHaveLength(5);
    });

    it("sorts multiple matching tools by relevance (highest first)", () => {
      registry.addTools([
        makeTool({
          name: "search_files",
          description: "Search for files by name",
          serverDescription: "",
          keywords: [],
        }),
        makeTool({
          name: "search",
          description: "Generic search functionality",
          serverDescription: "",
          keywords: [],
        }),
        makeTool({
          name: "find_text",
          description: "Search text in documents",
          serverDescription: "",
          keywords: [],
        }),
      ]);
      const results = registry.search("search");
      expect(results.length).toBeGreaterThanOrEqual(2);
      // "search" exact match should be first
      expect(results[0].tool_name).toBe("search");
      // Scores should be in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i].relevance_score).toBeLessThanOrEqual(
          results[i - 1].relevance_score
        );
      }
    });

    it("rounds relevance scores to 2 decimal places", () => {
      registry.addTool(makeTool({ name: "test", description: "test tool" }));
      const results = registry.search("test");
      const score = results[0].relevance_score;
      expect(score).toBe(Math.round(score * 100) / 100);
    });

    it("includes server_name and description in results", () => {
      registry.addTool(
        makeTool({
          name: "my_tool",
          description: "My tool description",
          server: "my-server",
        })
      );
      const results = registry.search("my_tool");
      expect(results[0]).toEqual(
        expect.objectContaining({
          tool_name: "my_tool",
          server_name: "my-server",
          description: "My tool description",
        })
      );
    });

    it("handles multi-word queries matching across fields", () => {
      registry.addTool(
        makeTool({
          name: "send_message",
          description: "Send a slack notification",
          serverDescription: "Slack integration server",
          keywords: ["slack", "message"],
        })
      );
      const results = registry.search("send slack notification");
      expect(results).toHaveLength(1);
      // Multiple tokens matching across fields should yield high score
      expect(results[0].relevance_score).toBeGreaterThan(1.0);
    });
  });
});

describe("extractKeywords", () => {
  it("splits camelCase into separate words", () => {
    const keywords = extractKeywords("readFile", "");
    expect(keywords).toContain("read");
    expect(keywords).toContain("file");
  });

  it("splits snake_case into separate words", () => {
    const keywords = extractKeywords("read_file", "");
    expect(keywords).toContain("read");
    expect(keywords).toContain("file");
  });

  it("splits kebab-case into separate words", () => {
    const keywords = extractKeywords("read-file", "");
    expect(keywords).toContain("read");
    expect(keywords).toContain("file");
  });

  it("includes words from description", () => {
    const keywords = extractKeywords("tool", "Execute SQL queries on database");
    expect(keywords).toContain("execute");
    expect(keywords).toContain("sql");
    expect(keywords).toContain("queries");
    expect(keywords).toContain("database");
  });

  it("filters out short words (length <= 2)", () => {
    const keywords = extractKeywords("a_b", "do it on");
    // "a", "b", "do", "it", "on" are all <= 2 chars
    expect(keywords).toEqual([]);
  });

  it("deduplicates keywords", () => {
    const keywords = extractKeywords("read", "read the file then read again");
    const readCount = keywords.filter((k) => k === "read").length;
    expect(readCount).toBe(1);
  });

  it("lowercases all keywords", () => {
    const keywords = extractKeywords("ReadFile", "Execute SQL");
    for (const kw of keywords) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });
});

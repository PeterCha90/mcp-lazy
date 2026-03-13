export interface ToolEntry {
  name: string;
  description: string;
  server: string;
  serverDescription: string;
  inputSchema: Record<string, unknown>;
  keywords: string[];
}

export interface SearchResult {
  tool_name: string;
  server_name: string;
  description: string;
  relevance_score: number;
}

export class ToolRegistry {
  private tools: ToolEntry[] = [];

  addTool(entry: ToolEntry): void {
    this.tools.push(entry);
  }

  addTools(entries: ToolEntry[]): void {
    this.tools.push(...entries);
  }

  getToolCount(): number {
    return this.tools.length;
  }

  getAllTools(): ToolEntry[] {
    return [...this.tools];
  }

  getServerNames(): string[] {
    return [...new Set(this.tools.map((t) => t.server))];
  }

  getToolsByServer(serverName: string): ToolEntry[] {
    return this.tools.filter((t) => t.server === serverName);
  }

  findTool(toolName: string, serverName: string): ToolEntry | undefined {
    return this.tools.find(
      (t) => t.name === toolName && t.server === serverName
    );
  }

  search(query: string, limit: number = 5): SearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(Boolean);

    const scored: { entry: ToolEntry; score: number }[] = [];

    for (const entry of this.tools) {
      let score = 0;
      const nameLower = entry.name.toLowerCase();
      const descLower = entry.description.toLowerCase();
      const serverDescLower = entry.serverDescription.toLowerCase();

      // 1. tool_name exact match
      if (nameLower === queryLower) {
        score += 1.0;
      }
      // 2. tool_name partial match
      else if (
        nameLower.includes(queryLower) ||
        queryTokens.some((t) => nameLower.includes(t))
      ) {
        score += 0.8;
      }

      // 3. description keyword match (per token)
      for (const token of queryTokens) {
        if (descLower.includes(token)) {
          score += 0.6;
        }
      }

      // 4. server description match
      for (const token of queryTokens) {
        if (serverDescLower.includes(token)) {
          score += 0.4;
          break; // Only count once for server description
        }
      }

      // Also check keywords
      for (const token of queryTokens) {
        if (entry.keywords.some((k) => k.toLowerCase().includes(token))) {
          score += 0.3;
        }
      }

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry, score }) => ({
        tool_name: entry.name,
        server_name: entry.server,
        description: entry.description,
        relevance_score: Math.round(score * 100) / 100,
      }));
  }

  clear(): void {
    this.tools = [];
  }
}

// Helper to extract keywords from tool name and description
export function extractKeywords(name: string, description: string): string[] {
  const text = `${name} ${description}`;
  const words = text
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return [...new Set(words)];
}

# mcp-lazy

[한국어](./docs/README.ko.md)

> Reduce MCP context window token usage by 90%+ with lazy loading. One command setup.

MCP servers load all tool definitions into the context window at startup — even before you use them. With 5-10 servers, this can consume 30-50% of your context window. **mcp-lazy** proxies all your MCP servers through a single lightweight proxy that loads tools on-demand.

## Quick Start

```bash
npx mcp-lazy init
```

That's it. This auto-detects your MCP configs, generates a proxy config, and registers it with your AI agents.

## How It Works

```
Without mcp-lazy:
  Agent → MCP Server A (50 tools) + Server B (30 tools) + Server C (20 tools)
        = 100 tools loaded at startup (~67,000 tokens)

With mcp-lazy:
  Agent → mcp-lazy proxy (2 tools only, ~2,100 tokens)
              ↓ on-demand
         Server A / B / C (loaded only when needed)
```

The proxy exposes just 2 tools:
- **mcp_search_tools** — Search available tools by keyword
- **mcp_execute_tool** — Execute a tool (lazy-loads the server on first call)

## Supported Agents

| Agent | Status |
|-------|--------|
| Cursor | ✓ Supported |
| Windsurf | ✓ Supported |
| Opencode | ✓ Supported |
| Antigravity | ✓ Supported |
| Claude Code | Native support (not needed) |

## Commands

### `npx mcp-lazy init`

Auto-detect MCP configs and set up the proxy:

```bash
$ npx mcp-lazy init

Found .mcp.json (7 servers)
Collecting tools...
  ✓ github-mcp        (27 tools, ~17,550 tokens)
  ✓ postgres-mcp      (12 tools, ~7,800 tokens)
  ✓ filesystem-mcp    ( 8 tools, ~5,200 tokens)

Current estimated token usage: 67,300 tokens
With mcp-lazy:              2,100 tokens (97% reduction)

✓ mcp-lazy-config.json created
✓ Registered with Cursor
```

### `npx mcp-lazy add`

Register the proxy with specific agents:

```bash
npx mcp-lazy add --cursor
npx mcp-lazy add --windsurf
npx mcp-lazy add --all
```

### `npx mcp-lazy doctor`

Diagnose your setup:

```bash
$ npx mcp-lazy doctor

✓ Node.js 18+ installed
✓ mcp-lazy-config.json found
✓ Cursor: registered
✗ Windsurf: not registered → npx mcp-lazy add --windsurf

Token savings: 67,300 → 2,100 (97% reduction)
```

## Requirements

- Node.js 18+
- Existing MCP server configurations

## How Search Works

When an agent calls `mcp_search_tools("query database")`, the proxy searches across all registered tools using weighted scoring:

| Match Type | Score |
|-----------|-------|
| Exact tool name match | +1.0 |
| Partial tool name match | +0.8 |
| Description keyword match | +0.6 |
| Server description match | +0.4 |

Results are sorted by relevance and returned to the agent.

## Configuration

The `mcp-lazy-config.json` file stores your server configs:

```json
{
  "version": "1.0",
  "servers": {
    "github-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "description": "GitHub operations: issues, PRs, repos"
    }
  }
}
```

## License

MIT

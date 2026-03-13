<pre>
███╗   ███╗ ██████╗██████╗       ██╗      █████╗ ███████╗██╗   ██╗
████╗ ████║██╔════╝██╔══██╗      ██║     ██╔══██╗╚══███╔╝╚██╗ ██╔╝
██╔████╔██║██║     ██████╔╝█████╗██║     ███████║  ███╔╝  ╚████╔╝
██║╚██╔╝██║██║     ██╔═══╝ ╚════╝██║     ██╔══██║ ███╔╝    ╚██╔╝
██║ ╚═╝ ██║╚██████╗██║           ███████╗██║  ██║███████╗   ██║
╚═╝     ╚═╝ ╚═════╝╚═╝           ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝
</pre>

# mcp-lazy

[한국어](./docs/README.ko.md)

> Reduce MCP context window token usage by 90%+ with lazy loading. One command setup.

MCP servers load all tool definitions into the context window at startup — even before you use them. With 5-10 servers, this can consume 30-50% of your context window. **mcp-lazy** proxies all your MCP servers through a single lightweight proxy that loads tools on-demand.

## Quick Start

```bash
npx mcp-lazy add --cursor
npx mcp-lazy add --codex
npx mcp-lazy add --antigravity
npx mcp-lazy add --all          # or register all at once
```

That's it. The `add` command reads your agent's existing MCP config, saves all server definitions to `~/.mcp-lazy/servers.json`, and replaces the agent config with only the mcp-lazy proxy entry.

> **Tip:** Installed a new MCP server? Just re-run `npx mcp-lazy add --<agent>` — no extra steps.

## How It Works

![mcp-lazy Architecture](./architecture.png)

```
Without mcp-lazy:
  Agent → MCP Server A (50 tools) + Server B (30 tools) + Server C (20 tools)
        = 100 tools loaded at startup (~67,000 tokens)

With mcp-lazy:
  Agent → mcp-lazy proxy (2 tools only, ~2,100 tokens)
              ↓ on-demand
         Server A / B / C (loaded only when needed)
         URL servers (Notion, Slack, etc.) via mcp-remote bridge
```

The proxy exposes just 2 tools:

- **mcp_search_tools** — Search available tools by keyword
- **mcp_execute_tool** — Execute a tool (lazy-loads the server on first call)

## What `add` Does

When you run `npx mcp-lazy add --<agent>`, it:

1. Reads your agent's existing MCP server config
2. Extracts all server definitions (stdio and URL-based)
3. Converts URL servers (OAuth-requiring services like Notion, Slack) to stdio commands using `npx mcp-remote <url>`
4. Saves everything to `~/.mcp-lazy/servers.json`
5. Replaces the agent config with only the mcp-lazy proxy entry

The proxy reads from `~/.mcp-lazy/servers.json` at runtime — that's where all your server definitions live after setup.

## Supported Agents

| Agent       | Status                      |
| ----------- | --------------------------- |
| Cursor      | ✓ Supported                 |
| Windsurf    | ✓ Supported                 |
| Opencode    | ✓ Supported                 |
| Antigravity | ✓ Supported                 |
| Codex       | ✓ Supported                 |
| Claude Code | Native support (not needed) |

## Commands

### `npx mcp-lazy add`

Register the proxy with your agent:

```bash
npx mcp-lazy add --cursor        # register with Cursor
npx mcp-lazy add --antigravity   # register with Antigravity
npx mcp-lazy add --all           # register with all agents
```

Options:

- `--cursor`, `--windsurf`, `--opencode`, `--antigravity`, `--codex` — target agent
- `--all` — register with all agents

### `npx mcp-lazy doctor`

Diagnose your setup:

```bash
$ npx mcp-lazy doctor

✓ Node.js 18+ installed
✓ 7 MCP server(s) registered
  - github, notion, slack, postgres, filesystem, memory, puppeteer
✓ Cursor: registered
✗ Windsurf: not registered → npx mcp-lazy add --windsurf

Token savings: 67,300 → 2,100 (97% reduction)
```

## URL & OAuth Support

Some MCP servers are hosted at a URL and require OAuth (Notion, Slack, Linear, etc.). The `add` command automatically handles these by converting them to stdio commands using `npx mcp-remote`:

```
URL server: https://mcp.notion.com/sse
          ↓ converted automatically
stdio:    npx mcp-remote https://mcp.notion.com/sse
```

This means all your servers — local stdio and remote OAuth-requiring URL servers — get proxied through mcp-lazy with no manual conversion needed.

## How Search Works

When an agent calls `mcp_search_tools("query database")`, the proxy searches across all registered tools using weighted scoring:

| Match Type                | Score |
| ------------------------- | ----- |
| Exact tool name match     | +1.0  |
| Partial tool name match   | +0.8  |
| Description keyword match | +0.6  |
| Server description match  | +0.4  |

Results are sorted by relevance and returned to the agent.

## Requirements

- Node.js 18+
- Existing MCP server configurations

## License

MIT

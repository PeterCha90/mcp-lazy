# SPEC.md — mcp-lazy-proxy

> **한 줄 정의:** 모든 AI 에이전트(Cursor, Windsurf, Opencode, Antigravity 등)에서
> `npx mcp-lazy init` 한 줄로 MCP lazy loading을 활성화하는 Node.js/TypeScript 프록시 서버

---

## 1. 문제 정의

MCP 서버는 연결 시 모든 툴 definition이 컨텍스트 윈도우에 즉시 로딩된다.

```
실제 사례:
  github-mcp       → 18,340 tokens
  postgres-mcp     →  8,120 tokens
  filesystem-mcp   →  5,200 tokens
  ...
  합계             → 67,300 tokens (200k의 33.7%) — 사용 전부터 소비
```

Claude Code 2.1.7은 네이티브 Tool Search로 이를 해결했으나,
**Cursor / Windsurf / Opencode / Antigravity 등 다른 에이전트는 여전히 미해결.**

기존 해결책인 `lazy-mcp`(Go)는 빌드 환경 필요 + 수동 JSON 설정으로 진입장벽이 높다.

---

## 2. 목표

| 목표        | 기준                                                 |
| ----------- | ---------------------------------------------------- |
| 설치 간편성 | `npx mcp-lazy init` 한 줄, 30초 이내 완료            |
| 토큰 절감   | 초기 컨텍스트 사용량 90% 이상 감소                   |
| 호환성      | Cursor / Windsurf / Opencode / Antigravity 동시 지원 |
| Zero-config | 기존 `.mcp.json` 자동 인식, 별도 설정 불필요         |
| 런타임      | Node.js 18+ 외 추가 의존성 없음                      |

---

## 3. 기술 스택

```
언어:     TypeScript (Node.js 18+)
MCP SDK:  @modelcontextprotocol/sdk
CLI:      commander
검증:     zod
테스트:   vitest
빌드:     tsup (단일 파일 번들)
배포:     npm (npx 즉시 실행)
```

---

## 4. 시스템 아키텍처

```
기존 구조:
  에이전트 → MCP서버A (50툴) + MCP서버B (30툴) + MCP서버C (20툴)
           = 시작 시 100개 툴 전부 컨텍스트 로딩

mcp-lazy-proxy 적용 후:
  에이전트 → mcp-lazy-proxy (툴 2개만 노출)
                  ↓ 필요할 때만
             MCP서버A / B / C (on-demand 로딩)
```

### 데이터 흐름

```
1. 에이전트 시작
   → mcp-lazy-proxy만 연결 (~2,100 tokens)

2. 에이전트가 작업 중 MCP 툴 필요
   → mcp_search_tools("DB 쿼리 실행") 호출

3. proxy가 registry에서 키워드 매칭
   → "postgres-mcp의 query_database 툴 관련" 반환

4. 에이전트가 mcp_execute_tool("query_database", "postgres-mcp", {...}) 호출

5. proxy가 postgres-mcp 서버 시작 (최초 1회만)
   → 실제 툴 실행 → 결과 반환

6. 이후 postgres-mcp 호출은 캐시된 연결 재사용
```

---

## 5. 디렉토리 구조

```
mcp-lazy-proxy/
├── src/
│   ├── index.ts              # CLI 진입점
│   ├── proxy/
│   │   ├── server.ts         # 프록시 MCP 서버
│   │   ├── registry.ts       # 툴 registry 관리
│   │   └── loader.ts         # on-demand 서버 로딩
│   ├── cli/
│   │   ├── init.ts           # init 커맨드
│   │   ├── add.ts            # add 커맨드
│   │   └── doctor.ts         # doctor 커맨드
│   ├── agents/
│   │   ├── cursor.ts
│   │   ├── windsurf.ts
│   │   ├── opencode.ts
│   │   ├── antigravity.ts
│   │   └── claude-code.ts
│   └── utils/
│       ├── config.ts         # .mcp.json 파싱
│       └── mcp-client.ts     # MCP 서버 연결 & 툴 fetch
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## 6. CLI 명세

### 6-1. `npx mcp-lazy init`

기존 MCP 설정을 자동으로 인식하고 proxy 설정을 생성한다.

**탐색 순서:**

1. 현재 디렉토리 `.mcp.json`
2. `~/.claude/claude_desktop_config.json`
3. 에이전트별 기본 설정 파일

**실행 UX:**

```
$ npx mcp-lazy init

🔍 .mcp.json 발견 (7개 서버)
📋 툴 목록 수집 중...
  ✓ github-mcp        (27개 툴, 18,340 tokens)
  ✓ postgres-mcp      (12개 툴,  8,120 tokens)
  ✓ filesystem-mcp    ( 8개 툴,  5,200 tokens)

📊 현재 예상 토큰 사용량: 67,300 tokens (33.7% of 200k)
✨ mcp-lazy 적용 후:     2,100 tokens  (1.1% of 200k)

❓ 어느 에이전트에 등록하시겠어요? (스페이스로 선택)
  ◉ Cursor
  ◉ Windsurf
  ◯ Opencode
  ◯ Antigravity

✅ 완료! .cursor/mcp.json 업데이트됨
```

**생성 파일:** `mcp-lazy-config.json`

```json
{
  "version": "1.0",
  "servers": {
    "github-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "description": "GitHub operations: issues, PRs, repos, code search"
    },
    "postgres-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "description": "PostgreSQL database queries and schema management"
    }
  }
}
```

---

### 6-2. `npx mcp-lazy add`

특정 에이전트에 proxy를 등록한다.

```bash
npx mcp-lazy add --cursor          # Cursor에 등록
npx mcp-lazy add --windsurf        # Windsurf에 등록
npx mcp-lazy add --opencode        # Opencode에 등록
npx mcp-lazy add --antigravity     # Antigravity에 등록
npx mcp-lazy add --all             # 감지된 모든 에이전트에 등록
```

---

### 6-3. `npx mcp-lazy doctor`

설치 상태와 토큰 절감량을 진단한다.

```
$ npx mcp-lazy doctor

🏥 mcp-lazy 상태 진단

✅ Node.js 18.x 설치됨
✅ mcp-lazy-config.json 존재
✅ Cursor 설정 연결됨
⚠️  Windsurf 설정 없음  →  npx mcp-lazy add --windsurf
❌ github-mcp 서버 연결 실패  →  설정 확인 필요

토큰 절감: 67,300 → 2,100 (95% 절감)
```

---

### 6-4. `npx mcp-lazy serve`

proxy 서버를 stdio 모드로 실행한다. (에이전트가 내부적으로 호출, 사용자 직접 실행 불필요)

```bash
npx mcp-lazy serve --config mcp-lazy-config.json
```

---

## 7. 프록시 MCP 서버 명세

### 노출 툴: 2개만

#### `mcp_search_tools`

```typescript
{
  name: "mcp_search_tools",
  description: `Search available MCP tools by keyword.
    Use this BEFORE calling any MCP tool.
    Returns matching tool names, server names, and descriptions.
    Example: mcp_search_tools("query database") → postgres-mcp.query_database`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What you want to do in natural language"
      },
      limit: {
        type: "number",
        description: "Max results to return (default: 5)"
      }
    },
    required: ["query"]
  }
}
```

**반환 예시:**

```json
{
  "results": [
    {
      "tool_name": "query_database",
      "server_name": "postgres-mcp",
      "description": "Execute SQL queries against PostgreSQL database",
      "relevance_score": 0.92
    },
    {
      "tool_name": "list_tables",
      "server_name": "postgres-mcp",
      "description": "List all tables in the database",
      "relevance_score": 0.78
    }
  ]
}
```

---

#### `mcp_execute_tool`

```typescript
{
  name: "mcp_execute_tool",
  description: `Execute a specific MCP tool.
    Use tool_name and server_name from mcp_search_tools results.`,
  inputSchema: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description: "Tool name from mcp_search_tools"
      },
      server_name: {
        type: "string",
        description: "Server name from mcp_search_tools"
      },
      arguments: {
        type: "object",
        description: "Tool arguments"
      }
    },
    required: ["tool_name", "server_name"]
  }
}
```

---

## 8. ToolRegistry 인터페이스

```typescript
interface ToolEntry {
  name: string;
  description: string;
  server: string;
  inputSchema: object;
  keywords: string[]; // 검색용 키워드 (자동 추출)
}

interface ServerProcess {
  client: McpClient;
  pid: number;
  loadedAt: Date;
}

class ToolRegistry {
  // .mcp.json 읽어서 각 서버 연결 → tools/list → registry 빌드
  async build(configPath: string): Promise<void>;

  // 키워드로 툴 검색 (tool name + description 기반 유사도 매칭)
  search(query: string, limit?: number): ToolEntry[];

  // 특정 서버 lazy 시작 (최초 1회만, 이후 캐시)
  async loadServer(serverName: string): Promise<McpClient>;

  // 현재 로딩된 서버 목록 반환
  getLoadedServers(): string[];
}
```

---

## 9. 에이전트별 설정 파일 경로

| 에이전트    | 설정 파일 경로                               |
| ----------- | -------------------------------------------- |
| Cursor      | `.cursor/mcp.json` 또는 `~/.cursor/mcp.json` |
| Windsurf    | `~/.codeium/windsurf/mcp_config.json`        |
| Opencode    | `.opencode/mcp.json`                         |
| Antigravity | `.agents/mcp.json`                           |
| Claude Code | `.mcp.json` (네이티브 지원으로 선택적)       |

### 생성되는 에이전트 설정 포맷 (Cursor 예시)

```json
{
  "mcpServers": {
    "mcp-lazy-proxy": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-lazy-proxy",
        "serve",
        "--config",
        "./mcp-lazy-config.json"
      ]
    }
  }
}
```

---

## 10. 검색 알고리즘

키워드 매칭은 다음 순서로 점수를 계산한다:

```
1. tool_name 정확 일치        → score += 1.0
2. tool_name 부분 일치        → score += 0.8
3. description 키워드 포함    → score += 0.6 (키워드당)
4. server description 일치    → score += 0.4
5. 결과를 score 내림차순 정렬 → 상위 limit개 반환
```

---

## 11. 에러 처리

| 상황               | 동작                                  |
| ------------------ | ------------------------------------- |
| MCP 서버 시작 실패 | 에러 메시지 + 대안 툴 제안            |
| 툴 검색 결과 없음  | 유사 키워드 제안                      |
| 설정 파일 없음     | `npx mcp-lazy init` 실행 안내         |
| 서버 타임아웃      | 30초 후 재시도 1회, 실패 시 에러 반환 |

---

## 12. 성공 기준

- [ ] `npx mcp-lazy init` 30초 이내 완료
- [ ] Cursor에서 MCP 툴 on-demand 로딩 동작 확인
- [ ] Windsurf에서 동일 동작 확인
- [ ] 초기 토큰 사용량 90%+ 감소 측정
- [ ] npm 배포 완료 (`npx mcp-lazy` 즉시 실행 가능)
- [ ] 핵심 모듈 테스트 커버리지 80%+

---

## 13. 레퍼런스

- [lazy-mcp (Go)](https://github.com/voicetreelab/lazy-mcp) — 선행 구현 참고
- [Claude Code Tool Search 공식 문서](https://code.claude.com/docs/en/mcp) — 네이티브 구현 참고
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP TypeScript SDK
- [add-mcp](https://github.com/neondatabase/add-mcp) — 에이전트 자동 감지 참고

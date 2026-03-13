# mcp-lazy

[English](../README.md)

> MCP 컨텍스트 윈도우 토큰 사용량을 90% 이상 절감합니다. 명령어 한 줄이면 끝.

MCP 서버들은 시작할 때 모든 툴 정의를 컨텍스트 윈도우에 로딩합니다 — 사용하기도 전에요. 서버가 5~10개면 컨텍스트 윈도우의 30~50%를 차지할 수 있습니다. **mcp-lazy**는 모든 MCP 서버를 하나의 경량 프록시로 묶어서, 필요할 때만 툴을 로딩합니다.

## 빠른 시작

```bash
npx mcp-lazy add --cursor
npx mcp-lazy add --codex
npx mcp-lazy add --antigravity
npx mcp-lazy add --all          # 또는 한번에 전부 등록
```

끝! `add` 명령어가 에이전트의 기존 MCP 설정을 읽어서 모든 서버 정의를 `~/.mcp-lazy/servers.json`에 저장하고, 에이전트 설정을 mcp-lazy 프록시 항목 하나로 교체합니다.

> **Tip:** 새로운 MCP 서버를 설치했다면 `npx mcp-lazy add --<agent>`를 다시 실행하세요 — 추가 작업 없이 반영됩니다.

## 작동 원리

![mcp-lazy Architecture](../architecture.png)

```
mcp-lazy 없이:
  에이전트 → MCP서버A (50툴) + 서버B (30툴) + 서버C (20툴)
           = 시작 시 100개 툴 전부 로딩 (~67,000 토큰)

mcp-lazy 적용 후:
  에이전트 → mcp-lazy 프록시 (2개 툴만, ~2,100 토큰)
                  ↓ 필요할 때만
             서버A / B / C (on-demand 로딩)
             URL 서버 (Notion, Slack 등) — mcp-remote 브릿지 경유
```

프록시는 단 2개의 툴만 노출합니다:

- **mcp_search_tools** — 키워드로 사용 가능한 툴 검색
- **mcp_execute_tool** — 툴 실행 (최초 호출 시 서버 자동 시작)

## `add` 명령어가 하는 일

`npx mcp-lazy add --<agent>`를 실행하면:

1. 에이전트의 기존 MCP 서버 설정을 읽습니다
2. 모든 서버 정의를 추출합니다 (stdio 및 URL 기반 모두)
3. URL 서버(Notion, Slack 등 OAuth 인증이 필요한 서비스)를 `npx mcp-remote <url>` stdio 명령어로 자동 변환합니다
4. 모든 내용을 `~/.mcp-lazy/servers.json`에 저장합니다
5. 에이전트 설정을 mcp-lazy 프록시 항목 하나로 교체합니다

프록시는 실행 시 `~/.mcp-lazy/servers.json`을 읽습니다 — 설정 완료 후 모든 서버 정의는 이 파일에 저장됩니다.

## 지원 에이전트

| 에이전트 | 상태 |
|----------|------|
| Cursor | ✓ 지원 |
| Windsurf | ✓ 지원 |
| Opencode | ✓ 지원 |
| Antigravity | ✓ 지원 |
| Codex | ✓ 지원 |
| Claude Code | 네이티브 지원 (불필요) |

## 명령어

### `npx mcp-lazy add`

에이전트에 프록시를 등록합니다:

```bash
npx mcp-lazy add --cursor        # Cursor에 등록
npx mcp-lazy add --antigravity   # Antigravity에 등록
npx mcp-lazy add --all           # 모든 에이전트에 등록
```

옵션:

- `--cursor`, `--windsurf`, `--opencode`, `--antigravity`, `--codex` — 대상 에이전트
- `--all` — 모든 에이전트에 등록

### `npx mcp-lazy doctor`

설치 상태를 진단합니다:

```bash
$ npx mcp-lazy doctor

✓ Node.js 18+ 설치됨
✓ 7개 MCP 서버 등록됨
  - github, notion, slack, postgres, filesystem, memory, puppeteer
✓ Cursor: 등록됨
✗ Windsurf: 미등록 → npx mcp-lazy add --windsurf

토큰 절감: 67,300 → 2,100 (97% 절감)
```

## URL 및 OAuth 지원

일부 MCP 서버는 URL로 호스팅되며 OAuth 인증이 필요합니다 (Notion, Slack, Linear 등). `add` 명령어는 이런 서버들을 `npx mcp-remote`를 사용하는 stdio 명령어로 자동 변환합니다:

```
URL 서버: https://mcp.notion.com/sse
         ↓ 자동 변환
stdio:   npx mcp-remote https://mcp.notion.com/sse
```

즉, 로컬 stdio 서버와 OAuth 인증이 필요한 원격 URL 서버 모두 수동 변환 없이 mcp-lazy를 통해 프록시됩니다.

## 검색 알고리즘

에이전트가 `mcp_search_tools("DB 쿼리 실행")`을 호출하면, 프록시가 등록된 모든 툴에서 가중치 기반 검색을 수행합니다:

| 매칭 유형 | 점수 |
|-----------|------|
| 툴 이름 정확 일치 | +1.0 |
| 툴 이름 부분 일치 | +0.8 |
| 설명 키워드 일치 | +0.6 |
| 서버 설명 일치 | +0.4 |

결과는 관련도 순으로 정렬되어 에이전트에 반환됩니다.

## 요구사항

- Node.js 18+
- 기존 MCP 서버 설정

## 라이선스

MIT

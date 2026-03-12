# mcp-lazy

[English](../README.md)

> MCP 컨텍스트 윈도우 토큰 사용량을 90% 이상 절감합니다. 명령어 한 줄이면 끝.

MCP 서버들은 시작할 때 모든 툴 정의를 컨텍스트 윈도우에 로딩합니다 — 사용하기도 전에요. 서버가 5~10개면 컨텍스트 윈도우의 30~50%를 차지할 수 있습니다. **mcp-lazy**는 모든 MCP 서버를 하나의 경량 프록시로 묶어서, 필요할 때만 툴을 로딩합니다.

## 빠른 시작

```bash
npx mcp-lazy init
```

이게 끝입니다. 기존 MCP 설정을 자동으로 인식하고, 프록시 설정을 생성하고, AI 에이전트에 등록합니다.

## 작동 원리

```
mcp-lazy 없이:
  에이전트 → MCP서버A (50툴) + 서버B (30툴) + 서버C (20툴)
           = 시작 시 100개 툴 전부 로딩 (~67,000 토큰)

mcp-lazy 적용 후:
  에이전트 → mcp-lazy 프록시 (2개 툴만, ~2,100 토큰)
                  ↓ 필요할 때만
             서버A / B / C (on-demand 로딩)
```

프록시는 단 2개의 툴만 노출합니다:
- **mcp_search_tools** — 키워드로 사용 가능한 툴 검색
- **mcp_execute_tool** — 툴 실행 (최초 호출 시 서버 자동 시작)

## 지원 에이전트

| 에이전트 | 상태 |
|----------|------|
| Cursor | ✓ 지원 |
| Windsurf | ✓ 지원 |
| Opencode | ✓ 지원 |
| Antigravity | ✓ 지원 |
| Claude Code | 네이티브 지원 (불필요) |

## 명령어

### `npx mcp-lazy init`

MCP 설정을 자동 감지하고 프록시를 세팅합니다:

```bash
$ npx mcp-lazy init

.mcp.json 발견 (7개 서버)
툴 목록 수집 중...
  ✓ github-mcp        (27개 툴, ~17,550 토큰)
  ✓ postgres-mcp      (12개 툴, ~7,800 토큰)
  ✓ filesystem-mcp    ( 8개 툴, ~5,200 토큰)

현재 예상 토큰 사용량: 67,300 토큰
mcp-lazy 적용 후:    2,100 토큰 (97% 절감)

✓ mcp-lazy-config.json 생성 완료
✓ Cursor에 등록 완료
```

### `npx mcp-lazy add`

특정 에이전트에 프록시를 등록합니다:

```bash
npx mcp-lazy add --cursor
npx mcp-lazy add --windsurf
npx mcp-lazy add --all
```

### `npx mcp-lazy doctor`

설치 상태를 진단합니다:

```bash
$ npx mcp-lazy doctor

✓ Node.js 18+ 설치됨
✓ mcp-lazy-config.json 존재
✓ Cursor: 등록됨
✗ Windsurf: 미등록 → npx mcp-lazy add --windsurf

토큰 절감: 67,300 → 2,100 (97% 절감)
```

## 요구사항

- Node.js 18+
- 기존 MCP 서버 설정

## 검색 알고리즘

에이전트가 `mcp_search_tools("DB 쿼리 실행")`을 호출하면, 프록시가 등록된 모든 툴에서 가중치 기반 검색을 수행합니다:

| 매칭 유형 | 점수 |
|-----------|------|
| 툴 이름 정확 일치 | +1.0 |
| 툴 이름 부분 일치 | +0.8 |
| 설명 키워드 일치 | +0.6 |
| 서버 설명 일치 | +0.4 |

결과는 관련도 순으로 정렬되어 에이전트에 반환됩니다.

## 설정 파일

`mcp-lazy-config.json`에 서버 설정이 저장됩니다:

```json
{
  "version": "1.0",
  "servers": {
    "github-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "description": "GitHub 작업: 이슈, PR, 저장소"
    }
  }
}
```

## 라이선스

MIT

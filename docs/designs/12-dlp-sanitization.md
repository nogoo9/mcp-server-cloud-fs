# DLP Content Sanitization

> **Status:** ✅ Implemented in v0.7.0
> **Issue:** [#23](https://github.com/nogoo9/mcp-server-cloud-fs/issues/23)
> **Commit:** [`9182a42`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/9182a42) — `feat(middleware): DLP content sanitization for PII/secret redaction`
> **Branch:** `feat/v0.7.0-improvements`

## Problem

When an LLM reads files from cloud storage, sensitive content (API keys, PII, credentials) flows into the model's context window. There is no server-side mechanism to redact secrets before they reach the client. Users must rely on prompt instructions ("don't show me the API key"), which are unreliable.

## Design

### Goal

Intercept all tool responses at the middleware layer and redact content matching sensitive patterns. Opt-in via `--enable-dlp`.

### Architecture

Implemented as a **`registerTool` wrapper** that monkey-patches the MCP server's registration method before any tools are registered:

```
src/middleware/dlp.ts   → [NEW] DlpPattern, sanitizeContent(), applyDlpWrapper()
src/server.ts           → [MODIFY] conditionally apply DLP wrapper
src/index.ts            → [MODIFY] add --enable-dlp CLI flag
```

### Middleware Pattern

```typescript
export function applyDlpWrapper(server: McpServer, patterns?: DlpPattern[]): void {
  const dlpPatterns = patterns ?? DEFAULT_DLP_PATTERNS;
  const original = server.registerTool.bind(server);

  server.registerTool = (name, ...rest) => {
    const handler = rest[rest.length - 1];
    rest[rest.length - 1] = async (...handlerArgs) => {
      const result = await handler(...handlerArgs);
      // Sanitize text content blocks
      for (const item of result.content) {
        if (item.type === "text") {
          const { sanitized } = sanitizeContent(item.text, dlpPatterns);
          item.text = sanitized;
        }
      }
      return result;
    };
    return original(name, ...rest);
  };
}
```

### Default Patterns

| Pattern | Regex | Replacement |
|---------|-------|-------------|
| AWS Access Key | `AKIA[0-9A-Z]{16}` | `[REDACTED:AWS_KEY]` |
| AWS Secret Key | Lookbehind for `aws_secret_access_key` | `[REDACTED:AWS_SECRET]` |
| Generic Secret | 40-char hex after `secret_key` | `[REDACTED:SECRET]` |
| Email | Standard email regex | `[REDACTED:EMAIL]` |
| US SSN | `\d{3}-\d{2}-\d{4}` | `[REDACTED:SSN]` |
| Credit Card | 16-digit with optional separators | `[REDACTED:CC]` |
| JWT | `eyJ...` three-segment pattern | `[REDACTED:JWT]` |
| OpenAI Key | `sk-[A-Za-z0-9]{20,}` | `[REDACTED:API_KEY]` |
| Stripe Key | `sk_live_...` / `pk_test_...` | `[REDACTED:API_KEY]` |

### Key Decisions

- **Wrapper, not inline:** Applied via `applyDlpWrapper()` before tool registration — zero changes to individual tool handlers.
- **Regex `g` flag with `lastIndex` reset:** Each pattern resets `lastIndex` before matching to handle sequential calls safely.
- **No new dependencies:** Pure regex, no third-party DLP libraries.

## Implementation Plan

1. Create `src/middleware/dlp.ts` with `DlpPattern` interface, `DEFAULT_DLP_PATTERNS`, and `sanitizeContent()`.
2. Implement `applyDlpWrapper()` that wraps `registerTool`.
3. Add `--enable-dlp` flag to `src/index.ts`.
4. Conditionally apply wrapper in `createMcpServer()`.
5. Unit tests: `src/middleware/dlp.test.ts` — 14 tests covering all patterns, edge cases, and custom patterns.

## Acceptance Criteria

- [x] `--enable-dlp` enables redaction on all tool text responses
- [x] All 9 default patterns correctly redact matches
- [x] Multiple patterns in a single string are all redacted
- [x] Custom patterns can be added programmatically
- [x] Regex `lastIndex` is reset between calls (no stale state)
- [x] Non-sensitive content passes through unchanged
- [x] 14 unit tests passing

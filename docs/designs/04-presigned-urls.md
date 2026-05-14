# `get_presigned_url` Tool

## Problem

When an LLM needs to share a cloud-stored file with the user (e.g., an image, PDF, or large dataset), it currently has two bad options:

1. **`read_file`** — downloads the entire file and returns it as text/base64 in the response (expensive, hits token limits)
2. **Tell the user to go find it** — provides the `s3://` URI which isn't directly accessible via browser

Cloud providers support **presigned URLs** — temporary, authenticated HTTPS URLs that grant time-limited access to a specific object without exposing credentials. This is the canonical way to share cloud objects.

## Design

### Tool Definition

```typescript
server.registerTool("get_presigned_url", {
  description:
    "Generate a temporary, authenticated HTTPS URL for a cloud object. " +
    "The URL expires after the specified duration. " +
    "Useful for sharing files with users without downloading them through the LLM.",
  inputSchema: z.object({
    path: z.string().describe("Path to the cloud object"),
    expires_in: z.number().int().positive().default(600)
      .describe("URL validity in seconds (default: 600 = 10 minutes, max: 86400 = 24h)"),
    operation: z.enum(["get", "put"]).default("get")
      .describe("'get' for download URLs, 'put' for upload URLs"),
  }),
});
```

### Provider Interface Extension

Add an **optional** method to `StorageProvider`:

```typescript
export interface StorageProvider {
  // ... existing methods ...

  /** Generate a presigned URL for the object. Not all providers support this. */
  getPresignedUrl?(
    root: ParsedRoot,
    key: string,
    opts: { expiresIn: number; operation: "get" | "put" },
  ): Promise<string>;
}
```

### Provider Implementations

| Provider | Support | SDK Method |
|---|---|---|
| S3 | ✅ | `@aws-sdk/s3-request-presigner` → `getSignedUrl()` |
| Azure | ✅ | `generateBlobSASQueryParameters()` |
| GCS | ✅ | `file.getSignedUrl()` |
| Memory | ❌ | Return error: "Presigned URLs not supported for in-memory provider" |
| SQLite | ❌ | Return error: "Presigned URLs not supported for SQLite provider" |

### Security

- Enforce a maximum `expires_in` (e.g., 86400s = 24h).
- Upload presigned URLs (`operation: "put"`) require `cloud-fs:write` scope.
- Download presigned URLs require `cloud-fs:read` scope.
- Log presigned URL generation in audit log (when enabled).

## Implementation Plan

1. Add `getPresignedUrl?()` optional method to `StorageProvider` interface.
2. Implement in `S3Provider` using `@aws-sdk/s3-request-presigner`.
3. Implement in `AzureProvider` using SAS tokens.
4. Implement in `GcsProvider` using `getSignedUrl()`.
5. Create `handleGetPresignedUrl()` in `src/tools/extended.ts`.
6. Add capability check: if provider doesn't support it, return clear error.
7. Register tool, add to scope map.
8. Add `@aws-sdk/s3-request-presigner` to dependencies.
9. Unit tests with mock provider.
10. Integration tests with MinIO.

## Acceptance Criteria

- [ ] `get_presigned_url` returns a working HTTPS URL for S3, Azure, GCS
- [ ] URLs expire after the specified duration
- [ ] `operation: "put"` generates upload URLs
- [ ] Memory/SQLite providers return a descriptive error
- [ ] Maximum expiration enforced server-side
- [ ] Proper OAuth scope enforcement
- [ ] Unit and integration tests pass

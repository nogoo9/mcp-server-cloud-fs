# Descriptive Cloud-Aware Error Handling

## Problem

Current error handling uses generic catch-all messages. Cloud storage failures have specific, actionable causes that should be surfaced: rate limiting, region mismatches, permission denied, bucket not found, etc.

## Design

### Error Taxonomy

| Error Code | Description | Provider Source |
|---|---|---|
| `RATE_LIMITED` | "Rate limited by AWS. Retry after X seconds." | S3 `SlowDown`, Azure `429`, GCS `429` |
| `REGION_MISMATCH` | "Bucket is in us-west-2, but client configured for us-east-1." | S3 `PermanentRedirect` |
| `PERMISSION_DENIED` | "Access denied: check IAM policy for s3:GetObject on bucket." | S3 `AccessDenied`, Azure `403` |
| `BUCKET_NOT_FOUND` | "Bucket 'xyz' does not exist or is not accessible." | S3 `NoSuchBucket` |
| `OBJECT_TOO_LARGE` | "Object exceeds maximum size (5GB for single PUT)." | S3 limit |
| `QUOTA_EXCEEDED` | "Storage quota exceeded for this account." | Azure/GCS quota |
| `NETWORK_ERROR` | "Connection to endpoint failed. Check --endpoint and network." | Connection refused |

### Implementation

Create a `CloudError` class that wraps provider SDK errors with structured context:

```typescript
// src/errors.ts
export class CloudError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
```

Add error mapping in each provider:

```typescript
// In S3Provider
function mapS3Error(err: unknown, root: ParsedRoot, key: string): never {
  const name = (err as { name?: string }).name;
  if (name === "SlowDown" || name === "Throttling") {
    throw new CloudError("RATE_LIMITED", `Rate limited by AWS on ${root.bucket}/${key}. Retry shortly.`, "s3");
  }
  // ... more mappings
  throw err;
}
```

Tool handlers already catch errors and return `{ isError: true }` — they just need to use the structured `CloudError.message` which is already descriptive.

## Implementation Plan

1. Create `src/errors.ts` with `CloudError` class and error code constants
2. Add `mapS3Error()` in S3Provider for common S3 error codes
3. Add `mapAzureError()` in AzureProvider
4. Add `mapGcsError()` in GcsProvider
5. Tool handlers automatically surface better messages (no changes needed)
6. Unit tests: verify error mapping for each provider
7. Update docs with error reference

## Acceptance Criteria

- [ ] S3 rate limiting returns "Rate limited by AWS" message
- [ ] Permission errors include the specific permission needed
- [ ] Region mismatches suggest the correct region
- [ ] Network errors suggest checking endpoint configuration
- [ ] All existing tests continue to pass
- [ ] Error mapping does not affect happy-path performance

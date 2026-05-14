# OIDC & Managed Identity Support

## Problem

Current authentication to cloud providers relies on static credentials via environment variables (`AWS_ACCESS_KEY_ID`, `AZURE_STORAGE_CONNECTION_STRING`). In production:

1. **Security risk** — long-lived secrets can be leaked or stolen
2. **Rotation burden** — manual credential rotation is error-prone
3. **Non-standard** — enterprises use federated identity (OIDC, IRSA, Managed Identity)

Cloud SDKs already support these through their default credential chains, but the server doesn't document or test them, and some provider constructors may short-circuit the chain.

## Design

### What's Already Working

The AWS SDK v3 (`S3Client`) and GCS SDK (`@google-cloud/storage`) use **default credential chains** that automatically pick up:

- **AWS**: IRSA (via `AWS_WEB_IDENTITY_TOKEN_FILE`), EC2 instance profile, SSO, ECS task role
- **GCS**: Workload Identity, service account key, ADC (`gcloud auth application-default login`)

### What Needs Fixing

1. **Azure**: The `AzureProvider` constructor requires `AZURE_STORAGE_CONNECTION_STRING`, which is a static secret. It should also support `DefaultAzureCredential` from `@azure/identity`:

```typescript
// Current (static secret only)
new BlobServiceClient(connectionString);

// Target (fallback chain)
import { DefaultAzureCredential } from "@azure/identity";
const credential = new DefaultAzureCredential();
new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
```

2. **Documentation** — production guide should cover IRSA, Managed Identity, Workload Identity setups.

3. **CLI flag** for explicit credential mode:
```
--credential-mode <default|static|managed-identity>
```

### Security Enhancement: Explicit Credential Validation

Add a startup credential check that verifies the provider can authenticate before accepting MCP connections:

```typescript
async function validateCredentials(provider: StorageProvider, roots: ParsedRoot[]): Promise<void> {
  for (const root of roots) {
    try {
      await provider.listObjects(root, "", "/");
    } catch (err) {
      throw new Error(`Credential validation failed for ${root.uri}: ${err.message}`);
    }
  }
}
```

## Implementation Plan

1. Refactor `AzureProvider` to support `DefaultAzureCredential` as fallback
2. Add `@azure/identity` as optional peer dependency
3. Add `--credential-mode` CLI flag
4. Add startup credential validation
5. Update production docs with IRSA, Managed Identity, Workload Identity guides
6. Integration test: verify default credential chain works with MinIO

## Acceptance Criteria

- [ ] Azure provider works with `DefaultAzureCredential` (no connection string)
- [ ] Startup credential validation catches auth failures early
- [ ] `--credential-mode` CLI flag documented
- [ ] Production guide covers IRSA, Managed Identity, Workload Identity
- [ ] Existing static credential flow is unaffected
- [ ] No new hard dependencies (Azure Identity is optional peer dep)

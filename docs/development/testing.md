# Testing

The project uses a tiered testing strategy to balance speed and thoroughness.

## Test Tiers

| Tier | Command | Infrastructure | What it tests |
|---|---|---|---|
| **Unit** | `bun run test` | None | Cache, providers, tools, auth, middleware, VFS |
| **E2E (HTTP)** | `bun run test:e2e:http` | None | HTTP transport, health endpoints, tool operations |
| **E2E (Infra)** | `bun run test:e2e:infra` | Docker | Full end-to-end with MinIO + Redis via STDIO |
| **Integration** | `bun run test:integration` | Docker | Provider-specific operations against emulators |
| **All** | `bun run test:all` | Docker | Runs every test file across all tiers |

## Running Tests

### Unit Tests (no infrastructure)

```bash
bun test
# or
bun run test
```

### HTTP E2E Tests (no infrastructure)

```bash
bun run test:e2e:http
```

Tests health endpoints (`/healthz`, `/readyz`), tool operations (read, write, list, edit, shell), and 404 handling over the Streamable HTTP transport using the SDK's `StreamableHTTPClientTransport`.

### Infrastructure E2E (requires Docker)

```bash
bun run infra:up            # ensure MinIO + Redis are running
bun run test:e2e:infra      # runs src/server.e2e.test.ts (30s timeout)
```

Tests file write → read round-trip, list directory visibility (VFS coherence), cache hit/miss behaviour, and edit operations via the STDIO transport against a real S3-compatible backend.

### All E2E

```bash
bun run test:e2e            # runs both HTTP and infra E2E suites
```

## Infrastructure

All emulator services are defined in `infra/docker-compose.yml`:

| Service | Port | Purpose |
|---|---|---|
| MinIO | 9000 | S3-compatible provider tests |
| Azurite | 10000 | Azure Blob Storage provider tests |
| fake-gcs-server | 4443 | Google Cloud Storage provider tests |
| Redis | 6379 | Redis cache backend tests + E2E |
| RustFS | 9002 | S3-compatible (Rust-native) provider tests |

```bash
bun run infra:up       # start all containers
bun run infra:down     # tear down all containers
bun run infra:logs     # tail container logs
```

## CI Pipeline

The CI workflow runs on every push/PR:

1. **ci** job: lint → typecheck → unit tests (with coverage) → HTTP E2E → build
2. **e2e** job: full E2E with Docker Compose (MinIO, Redis)

HTTP E2E tests use the in-memory provider and need zero infrastructure, making them fast and reliable for every CI run.

## Coverage

```bash
bun run test:coverage   # runs all tests with --coverage, outputs coverage/lcov.info
```

Coverage results are visible at [Coveralls](https://coveralls.io/github/nogoo9/mcp-server-cloud-fs).

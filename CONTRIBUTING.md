# Contributing

## Prerequisites

- [Proto](https://moonrepo.dev/proto) — manages the pinned Bun version
- Docker — required for integration and end-to-end tests against local provider emulators

## Setup

Clone and install:

```bash
git clone https://github.com/nogoo9/mcp-server-cloud-fs.git
cd mcp-server-cloud-fs
proto use          # installs Bun 1.3.11 from .prototools
bun install
```

## Running tests

### Test tiers

The project has four tiers of tests. Each tier builds on the previous one.

| Tier | Command | What it tests | Requires infra? |
|---|---|---|---|
| **Unit** | `bun run test` | Tool handlers, cache backends, VFS overlay, path utilities, auth scopes, rate limiter | No |
| **Integration** | `bun run test:integration` | Provider implementations against emulator containers | Yes |
| **E2E (HTTP)** | `bun run test:e2e:http` | HTTP transport, health checks, tool operations over Streamable HTTP | No |
| **E2E (Infra)** | `bun run test:e2e:infra` | Full MCP server over STDIO transport with MinIO + Redis | Yes |
| **E2E (All)** | `bun run test:e2e` | Both HTTP and infra E2E suites | Partial (infra tests skip gracefully) |
| **All** | `bun run test:all` | Runs every test file (unit + integration + e2e) | Yes |

### Unit tests

Unit tests mock the storage provider and cache, then exercise tool handlers through the VFS layer. No cloud credentials or containers needed.

```bash
bun run test       # runs src/cache, src/providers, src/tools, src/auth, src/middleware, src/path-utils, src/vfs tests
```

Key conventions:

- Tool tests use the shared helpers in `src/tools/__test-helpers.ts` to build a `{ vfs, roots }` context
- VFS tests in `src/vfs.test.ts` cover inode overlay, dirIndex, tombstones, and persistence round-trip
- Cache backend tests (memory, filesystem, Redis) verify TTL, dirty tracking, and debounce behaviour
- Auth scope tests in `src/auth/scopes.test.ts` validate tool-to-scope mapping and admin override
- Rate limiter tests in `src/middleware/rate-limit.test.ts` cover burst, refill, and per-client isolation

### Integration tests

Integration tests run against local provider emulators (MinIO for S3, Azurite for Azure, fake-gcs-server for GCS). Start the containers first:

```bash
bun run infra:up            # starts MinIO, Azurite, fake-gcs-server, Redis
bun run test:integration    # runs src/providers/*.integration.test.ts
```

Each integration test suite:

1. Checks if the emulator endpoint is reachable (skips gracefully if not)
2. Creates a unique test prefix to avoid collisions
3. Exercises `putObject`, `getObject`, `headObject`, `listObjects`, `copyObject`, `deleteObject`, `createPrefix`
4. Cleans up after itself

### End-to-end tests

E2E tests validate the full MCP server stack — CLI arg parsing → provider → VFS → cache → transport → tool response.

There are two E2E test files:

| File | Transport | Provider | Infra needed? |
|---|---|---|---|
| `src/transports/http.e2e.test.ts` | Streamable HTTP | Memory (in-process) | **No** ✅ |
| `src/server.e2e.test.ts` | STDIO | MinIO (S3) + Redis | Yes (Docker) |

#### HTTP E2E (lightweight — run anywhere)

```bash
bun run test:e2e:http       # no containers needed, spawns server as child process
```

Tests health endpoints (`/healthz`, `/readyz`), tool operations (read, write, list, edit, shell), and 404 handling over the Streamable HTTP transport using the SDK's `StreamableHTTPClientTransport`.

#### Infrastructure E2E (requires Docker)

```bash
bun run infra:up            # ensure MinIO + Redis are running
bun run test:e2e:infra      # runs src/server.e2e.test.ts (30s timeout)
```

Tests file write → read round-trip, list directory visibility (VFS coherence), cache hit/miss behaviour, cache eviction after MCP-mediated writes, and edit operations via the STDIO transport against a real S3-compatible backend.

#### All E2E

```bash
bun run test:e2e            # runs both HTTP and infra E2E suites
```

### Lint, format, and typecheck

```bash
bun run lint       # check for lint and format issues (Biome)
bun run format     # auto-format source files
bun run check      # lint + format, apply safe fixes
bun run typecheck  # tsc --noEmit
```

### Build

```bash
bun run build      # tsc -p tsconfig.build.json → dist/ (JS + .d.ts + source maps)
```

### Coverage

Generate an lcov coverage report locally:

```bash
bun run test:coverage   # runs all tests with --coverage, outputs coverage/lcov.info
```

In CI, the [Coveralls GitHub Action](https://github.com/coverallsapp/github-action) uploads `coverage/lcov.info` after every push/PR to `main`. Coverage results are visible at [coveralls.io](https://coveralls.io/github/nogoo9/mcp-server-cloud-fs) and as a badge in the README.

### Documentation site

The docs live in `docs/` and are built with [VitePress](https://vitepress.dev/).

```bash
bun run docs:dev            # start dev server at http://localhost:5173
bun run docs:build          # build static site to docs/.vitepress/dist/
bun run docs:preview        # preview production build at http://localhost:4173
```

To add or edit pages:

1. Create or modify markdown files under `docs/`
2. Run `bun run docs:dev` to preview locally
3. Navigation is configured in `docs/.vitepress/config.mts`
4. Push changes — CI deploys versioned docs on tag push, PR previews on PR events

The docs are automatically deployed to GitHub Pages:
- **Versioned releases**: `https://nogoo9.github.io/mcp-server-cloud-fs/v{version}/`
- **PR previews**: `https://nogoo9.github.io/mcp-server-cloud-fs/pr/{number}/`
- **Latest**: `https://nogoo9.github.io/mcp-server-cloud-fs/latest/`

## Infrastructure

All emulator services are defined in `infra/docker-compose.yml`:

| Service | Port | Purpose |
|---|---|---|
| MinIO | 9000 | S3-compatible provider tests |
| Azurite | 10000 | Azure Blob Storage provider tests |
| fake-gcs-server | 4443 | Google Cloud Storage provider tests |
| Redis | 6379 | Redis cache backend tests + E2E |

```bash
bun run infra:up       # start all containers
bun run infra:down     # tear down all containers
bun run infra:logs     # tail container logs
```

## Code structure

```
src/
  index.ts          CLI entry point — parses args, builds provider/cache/VFS, starts transport
  server.ts         MCP server — registers all 20+ tools, defines ServerContext
  vfs.ts            Virtual Filesystem — inode overlay, dirIndex, tombstones, persistence
  lib.ts            Library barrel — public API re-exports for npm consumers
  path-utils.ts     Root-scoped path validation and cache key derivation
  providers/        StorageProvider implementations (S3, Azure, GCS, Memory, SQLite)
  cache/            CacheStore implementations (memory, filesystem, Redis, passthrough)
  tools/            Tool handlers — one file per tool group
    __test-helpers.ts  Shared makeProvider/makeCache/makeVfs for tests
  transports/       Transport implementations (STDIO, HTTP, WebSocket)
  auth/             OAuth scope definitions, JWT/JWKS token verification
  middleware/       Rate limiting, CORS, request logging
  app/              Interactive shell MCP app (xterm.js)
infra/
  docker-compose.yml  Emulator services (MinIO, Azurite, fake-gcs-server, Redis)
```

### Architecture overview

All tool handlers operate through the **VirtualFS** layer, which overlays an in-memory inode table and directory index atop the cache and storage provider. This ensures unflushed writes are immediately visible to all operations (FUSE-like coherence).

```
Tool Handlers → VirtualFS → CacheStore → StorageProvider
                  ↕ (inode/dirIndex/tombstone overlay)
```

See the [Architecture section in README.md](README.md#architecture-virtual-filesystem-vfs) for a detailed breakdown.

## Publishing to the MCP Registry

The `server.json` in the repo root describes this server for the [MCP Registry](https://modelcontextprotocol.io/registry/quickstart). To publish or update the listing:

```bash
npx mcp-publisher publish
```

This reads `server.json` and submits it to the registry. You'll need to authenticate with a registry token on first run. See the [MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart) for setup instructions.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

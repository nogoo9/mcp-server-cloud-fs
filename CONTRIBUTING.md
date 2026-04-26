# Contributing

## Prerequisites

- [Proto](https://moonrepo.dev/proto) — manages the pinned Bun version
- Docker — required for integration tests against local provider emulators

## Setup

Clone and install:

```bash
git clone https://github.com/nogoo9/mcp-server-cloud-fs.git
cd mcp-server-cloud-fs
proto use          # installs Bun 1.3.11 from .prototools
bun install
```

## Running tests

Unit tests (no cloud credentials required):

```bash
bun test
```

Lint and format ([Biome](https://biomejs.dev)):

```bash
bun run lint       # check for lint and format issues
bun run format     # auto-format source files
bun run check      # lint + format, apply safe fixes
```

Type check:

```bash
bun run typecheck
```

Build:

```bash
bun run build      # outputs dist/index.js
```

## Integration tests

Integration tests run against local provider emulators via Docker Compose:

```bash
bun run infra:up       # starts MinIO on :9000
bun run infra:setup    # creates the test-bucket
bun run test:integration
```

Tear down when done:

```bash
bun run infra:down
```

## Code structure

```
src/
  index.ts          CLI entry point — parses args, builds provider/cache/roots
  server.ts         MCP server — registers all 14 tools
  path-utils.ts     Root-scoped path validation
  providers/        StorageProvider implementations (S3, Azure, GCS)
  cache/            CacheStore implementations (memory, filesystem, Redis, passthrough)
  tools/            Tool handlers — one file per tool group
infra/
  docker-compose.yml  MinIO (S3-compatible) and other emulator services
```

## Publishing to the MCP Registry

The `server.json` in the repo root describes this server for the [MCP Registry](https://modelcontextprotocol.io/registry/quickstart). To publish or update the listing:

```bash
npx mcp-publisher publish
```

This reads `server.json` and submits it to the registry. You'll need to authenticate with a registry token on first run. See the [MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart) for setup instructions.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

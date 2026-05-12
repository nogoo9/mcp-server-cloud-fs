# Contributing

See the full [CONTRIBUTING.md](https://github.com/nogoo9/mcp-server-cloud-fs/blob/main/CONTRIBUTING.md) for detailed instructions.

## Prerequisites

- [Bun](https://bun.sh/) (primary runtime)
- [Docker](https://www.docker.com/) (for integration/E2E tests with emulators)
- [Git](https://git-scm.com/)

## Setup

```bash
git clone https://github.com/nogoo9/mcp-server-cloud-fs.git
cd mcp-server-cloud-fs
bun install
```

## Development Commands

| Command | Description |
|---|---|
| `bun install` | Install dependencies |
| `bun run build` | Build the project to `dist/` |
| `bun run typecheck` | Run TypeScript compiler in no-emit mode |
| `bun run check` | Lint, format, and auto-fix with Biome |
| `bun run format` | Auto-format source files |
| `bun test` | Run unit tests |
| `bun run test:e2e:http` | Run HTTP E2E tests (no infra needed) |
| `bun run test:e2e:infra` | Run infra E2E tests (requires Docker) |
| `bun run test:e2e` | Run all E2E tests |
| `bun run test:integration` | Run provider integration tests |
| `bun run test:all` | Run every test file across all tiers |
| `bun run infra:up` | Start provider emulators |
| `bun run infra:down` | Stop provider emulators |
| `bun run inspect:memory` | Debug with MCP Inspector |

## Documentation Site

The docs live in `docs/` and are built with [VitePress](https://vitepress.dev/).

```bash
bun run docs:dev            # start dev server at http://localhost:5173
bun run docs:build          # build static site to docs/.vitepress/dist/
bun run docs:preview        # preview production build at http://localhost:4173
```

To add or edit documentation pages:

1. Create or modify markdown files under `docs/`
2. Run `bun run docs:dev` to preview locally
3. Navigation is configured in `docs/.vitepress/config.mts`
4. Push changes — CI deploys versioned docs on tag push, PR previews on PR events

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

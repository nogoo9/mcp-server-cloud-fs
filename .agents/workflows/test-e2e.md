---
description: Conduct e2e test with a provisioned docker compose
---

Steps
- run lightweight HTTP E2E test with `bun run test:e2e:http` (no infra needed)
- spin up infrastructure with `bun run infra:up`
- wait for services to be healthy: MinIO (http://localhost:9000/minio/health/live), Redis (port 6379)
- run full e2e test with `bun run test:e2e`
- spin down infrastructure with `bun run infra:down`
#!/usr/bin/env bun
import { FilesystemStore } from "./cache/filesystem.js";
import type { CacheStore } from "./cache/interface.js";
import { MemoryStore } from "./cache/memory.js";
import { PassThroughCache } from "./cache/passthrough.js";
import { createRedisStore } from "./cache/redis.js";
import { parseUri } from "./path-utils.js";
import { AzureProvider } from "./providers/azure.js";
import { GcsProvider } from "./providers/gcs.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { MemoryProvider } from "./providers/memory.js";
import { S3Provider } from "./providers/s3.js";
import { SqliteProvider } from "./providers/sqlite.js";
import { createMcpServer } from "./server.js";
import {
	createTransport,
	DEFAULT_TRANSPORT_OPTIONS,
	type TransportType,
} from "./transports/index.js";
import { VirtualFS } from "./vfs.js";

function usage(): never {
	console.error(`Usage: cloud-fs-mcp <s3|azure|gcs|memory|sqlite> <root-uri> [root-uri...] [options]

Providers:
  s3      Amazon S3 / S3-compatible (MinIO, RustFS). Root URI: s3://bucket/prefix
  azure   Azure Blob Storage. Root URI: az://container/prefix
  gcs     Google Cloud Storage. Root URI: gs://bucket/prefix
  memory  In-memory (ephemeral, for demos). Root URI: mem://bucket-name
  sqlite  SQLite (persistent local). Root URI: sqlite://bucket-name

Transport & Network:
  --transport <stdio|http|ws>    Transport protocol (default: stdio)
  --port <number>                Listen port for http/ws (default: 3000)
  --host <address>               Bind address for http/ws (default: 127.0.0.1)

Authentication (http/ws only):
  --auth <none|builtin|external> Auth mode (default: none)
  --auth-issuer <url>            OAuth issuer URL (builtin mode)
  --auth-jwks-uri <url>          JWKS URI (external mode)
  --auth-audience <string>       Expected token audience (external mode)
  --auth-client-credentials      Enable Client Credentials ext-auth flow
  --auth-enterprise-idp <url>    Enable Enterprise-Managed Authorization

Production (http/ws only):
  --cors-origin <origin>         Allowed CORS origin (repeatable)
  --rate-limit <req/min>         Rate limit per client (default: 0 = disabled)
  --rate-limit-burst <n>         Burst allowance (default: 10)
  --request-logging              Enable structured JSON request logging

Storage & Cache:
  --region <region>              Provider region (S3, GCS)
  --endpoint <url>               Custom endpoint (S3-compatible: MinIO, RustFS)
  --cache-store <memory|fs|redis> Cache backend (default: memory)
  --cache-ttl <seconds>          Cache TTL in seconds (default: 60)
  --sync-debounce <ms>           Write debounce window in ms (default: 2000)
  --cache-dir <path>             Required when --cache-store fs
  --no-cache                     Disable caching (pass-through mode)
  --gcs-endpoint <url>           Custom endpoint for GCS
  --sqlite-db <path>             SQLite database file path

Tools:
  --enable-delete                Enable the delete_file tool (disabled by default)
  --enable-shell                 Enable the shell tool (disabled by default)
  --grep-max-objects <n>         Max objects grep_files will scan per call (default: 1000)
  --seed-demo                    Seed the VFS with sample files for demo / exploration

Credentials are always sourced from SDK credential chains (env, ~/.aws, ADC, etc.).
Redis URL via env: REDIS_URL (default: redis://localhost:6379)
`);
	process.exit(1);
}

interface CliArgs {
	providerName: "s3" | "azure" | "gcs" | "memory" | "sqlite";
	rootUris: string[];
	region?: string;
	endpoint?: string;
	cacheStore: "memory" | "fs" | "redis";
	cacheTtlMs: number;
	syncDebounceMs: number;
	cacheDir?: string;
	noCache: boolean;
	enableDelete: boolean;
	grepMaxObjects: number;
	gcsEndpoint?: string;
	enableShell: boolean;
	sqliteDb?: string;
	seedDemo: boolean;
	// v0.4.0 — transport & production
	transport: TransportType;
	port: number;
	host: string;
	auth: "none" | "builtin" | "external";
	authIssuer?: string;
	authJwksUri?: string;
	authAudience?: string;
	authClientCredentials: boolean;
	authEnterpriseIdp?: string;
	corsOrigins: string[];
	rateLimit: number;
	rateLimitBurst: number;
	requestLogging: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);
	if (args.length < 2) usage();

	const providerArg = args[0]!;
	const validProviders = ["s3", "azure", "gcs", "memory", "sqlite"];
	if (!validProviders.includes(providerArg)) usage();

	const rootUris: string[] = [];
	let region: string | undefined;
	let endpoint: string | undefined;
	let cacheStore: "memory" | "fs" | "redis" = "memory";
	let cacheTtlMs = 60_000;
	let syncDebounceMs = 2_000;
	let cacheDir: string | undefined;
	let noCache = false;
	let enableDelete = false;
	let grepMaxObjects = 1000;
	let gcsEndpoint: string | undefined;
	let enableShell = false;
	let sqliteDb: string | undefined;
	let seedDemo = false;

	// v0.4.0 — transport & production flags
	let transport: TransportType = "stdio";
	let port = DEFAULT_TRANSPORT_OPTIONS.port;
	let host = DEFAULT_TRANSPORT_OPTIONS.host;
	let auth: "none" | "builtin" | "external" = "none";
	let authIssuer: string | undefined;
	let authJwksUri: string | undefined;
	let authAudience: string | undefined;
	let authClientCredentials = false;
	let authEnterpriseIdp: string | undefined;
	const corsOrigins: string[] = [];
	let rateLimit = 0;
	let rateLimitBurst = 10;
	let requestLogging = false;

	for (let i = 1; i < args.length; i++) {
		const arg = args[i]!;
		if (
			arg.startsWith("s3://") ||
			arg.startsWith("az://") ||
			arg.startsWith("gs://") ||
			arg.startsWith("mem://") ||
			arg.startsWith("sqlite://")
		) {
			rootUris.push(arg);
		} else if (arg === "--region") {
			region = args[++i];
		} else if (arg === "--endpoint") {
			endpoint = args[++i];
		} else if (arg === "--cache-store") {
			const val = args[++i];
			if (val !== "memory" && val !== "fs" && val !== "redis") {
				console.error(`Invalid --cache-store value: ${String(val)}`);
				usage();
			}
			cacheStore = val;
		} else if (arg === "--cache-ttl") {
			cacheTtlMs = Number(args[++i]) * 1000;
		} else if (arg === "--sync-debounce") {
			syncDebounceMs = Number(args[++i]);
		} else if (arg === "--cache-dir") {
			cacheDir = args[++i];
		} else if (arg === "--no-cache") {
			noCache = true;
		} else if (arg === "--enable-delete") {
			enableDelete = true;
		} else if (arg === "--grep-max-objects") {
			const val = Number(args[++i]);
			if (!Number.isInteger(val) || val < 1) {
				console.error(
					`Invalid --grep-max-objects value: must be a positive integer`,
				);
				usage();
			}
			grepMaxObjects = val;
		} else if (arg === "--gcs-endpoint") {
			gcsEndpoint = args[++i];
		} else if (arg === "--enable-shell") {
			enableShell = true;
		} else if (arg === "--sqlite-db") {
			sqliteDb = args[++i];
		} else if (arg === "--seed-demo") {
			seedDemo = true;
		// v0.4.0 — transport & production flags
		} else if (arg === "--transport") {
			const val = args[++i];
			if (val !== "stdio" && val !== "http" && val !== "ws") {
				console.error(`Invalid --transport value: ${String(val)}. Must be stdio, http, or ws.`);
				usage();
			}
			transport = val;
		} else if (arg === "--port") {
			port = Number(args[++i]);
		} else if (arg === "--host") {
			host = args[++i]!;
		} else if (arg === "--auth") {
			const val = args[++i];
			if (val !== "none" && val !== "builtin" && val !== "external") {
				console.error(`Invalid --auth value: ${String(val)}. Must be none, builtin, or external.`);
				usage();
			}
			auth = val;
		} else if (arg === "--auth-issuer") {
			authIssuer = args[++i];
		} else if (arg === "--auth-jwks-uri") {
			authJwksUri = args[++i];
		} else if (arg === "--auth-audience") {
			authAudience = args[++i];
		} else if (arg === "--auth-client-credentials") {
			authClientCredentials = true;
		} else if (arg === "--auth-enterprise-idp") {
			authEnterpriseIdp = args[++i];
		} else if (arg === "--cors-origin") {
			corsOrigins.push(args[++i]!);
		} else if (arg === "--rate-limit") {
			rateLimit = Number(args[++i]);
		} else if (arg === "--rate-limit-burst") {
			rateLimitBurst = Number(args[++i]);
		} else if (arg === "--request-logging") {
			requestLogging = true;
		} else {
			console.error(`Unknown argument: ${arg}`);
			usage();
		}
	}

	if (rootUris.length === 0) {
		console.error("Error: at least one root URI is required.");
		usage();
	}
	if (cacheStore === "fs" && !cacheDir) {
		console.error(
			"Error: --cache-dir is required when --cache-store fs is set.",
		);
		usage();
	}
	if (providerArg === "sqlite" && !sqliteDb) {
		console.error("Error: --sqlite-db is required for the sqlite provider.");
		usage();
	}

	return {
		providerName: providerArg as CliArgs["providerName"],
		rootUris,
		...(region !== undefined && { region }),
		...(endpoint !== undefined && { endpoint }),
		cacheStore,
		cacheTtlMs,
		syncDebounceMs,
		...(cacheDir !== undefined && { cacheDir }),
		noCache,
		enableDelete,
		grepMaxObjects,
		...(gcsEndpoint !== undefined && { gcsEndpoint }),
		enableShell,
		...(sqliteDb !== undefined && { sqliteDb }),
		seedDemo,
		// v0.4.0
		transport,
		port,
		host,
		auth,
		...(authIssuer !== undefined && { authIssuer }),
		...(authJwksUri !== undefined && { authJwksUri }),
		...(authAudience !== undefined && { authAudience }),
		authClientCredentials,
		...(authEnterpriseIdp !== undefined && { authEnterpriseIdp }),
		corsOrigins,
		rateLimit,
		rateLimitBurst,
		requestLogging,
	};
}

async function seedDemoContent(
	vfs: VirtualFS,
	roots: ParsedRoot[],
): Promise<void> {
	const root = roots[0]!;
	const files: [string, string][] = [
		[
			"README.md",
			`# Cloud FS Demo

Welcome to the **cloud-fs** interactive shell!

## Quick Start
- \`ls\` — list files
- \`cat README.md\` — view this file
- \`head -n 5 data/users.csv\` — preview a CSV
- \`grep TODO src/app.ts\` — search for TODOs
- \`find -name "*.ts"\` — find TypeScript files
- \`wc src/app.ts\` — count lines/words/chars
- \`echo "hello" > notes.txt\` — write a file
- \`cat notes.txt | wc -l\` — pipe output

## Features
- Piping: \`cmd1 | cmd2 | cmd3\`
- Redirect: \`>\` (overwrite), \`>>\` (append), \`<\` (input)
- 17 POSIX-like commands — type \`help\` for the full list
`,
		],
		[
			"data/users.csv",
			`id,name,email,role,active
1,Alice Chen,alice@example.com,admin,true
2,Bob Smith,bob@example.com,editor,true
3,Carol Wu,carol@example.com,viewer,false
4,Dave Jones,dave@example.com,editor,true
5,Eve Martin,eve@example.com,admin,true
6,Frank Lee,frank@example.com,viewer,true
7,Grace Kim,grace@example.com,editor,false
8,Hank Patel,hank@example.com,viewer,true
`,
		],
		[
			"data/config.json",
			`{
  "app": "cloud-fs-demo",
  "version": "0.4.0",
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "demo_db"
  },
  "features": {
    "auth": true,
    "logging": true,
    "cache_ttl_seconds": 300
  },
  "allowed_origins": [
    "https://example.com",
    "https://staging.example.com"
  ]
}
`,
		],
		[
			"data/logs.txt",
			`2024-01-15 08:23:01 INFO  Server started on port 3000
2024-01-15 08:23:02 INFO  Connected to database
2024-01-15 08:24:15 WARN  Slow query detected (1.2s): SELECT * FROM users
2024-01-15 08:30:00 INFO  Health check OK
2024-01-15 09:01:33 ERROR Connection timeout to redis:6379
2024-01-15 09:01:34 WARN  Falling back to in-memory cache
2024-01-15 09:15:00 INFO  Health check OK
2024-01-15 10:02:44 ERROR Unhandled exception in /api/users: TypeError
2024-01-15 10:02:45 INFO  Error reported to monitoring
2024-01-15 11:00:00 INFO  Health check OK
`,
		],
		[
			"src/app.ts",
			`// src/app.ts — Main application entry point
import { createServer } from "./server";
import { loadConfig } from "./utils";

// TODO: Add authentication middleware
// TODO: Implement rate limiting

const config = loadConfig();

export function start() {
  const server = createServer(config);
  server.listen(config.port, () => {
    console.log(\`Server running on port \${config.port}\`);
  });
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  process.exit(0);
});

start();
`,
		],
		[
			"src/utils.ts",
			`// src/utils.ts — Shared utilities
// TODO: Add input validation helpers

export interface Config {
  port: number;
  dbUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT) || 3000,
    dbUrl: process.env.DATABASE_URL || "postgres://localhost:5432/demo",
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) || "info",
  };
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return \`\${size.toFixed(1)} \${units[idx]}\`;
}
`,
		],
		[
			"src/server.ts",
			`// src/server.ts — HTTP server setup
import type { Config } from "./utils";

export function createServer(config: Config) {
  // TODO: Add CORS middleware
  // TODO: Add request logging

  return {
    listen: (port: number, cb: () => void) => {
      cb();
    },
  };
}
`,
		],
		[
			"docs/getting-started.md",
			`# Getting Started

## Prerequisites
- Node.js >= 18
- A cloud storage account (S3, Azure, or GCS)

## Installation
\`\`\`bash
npm install @nogoo9/mcp-server-cloud-fs
\`\`\`

## Configuration
Set your credentials via environment variables:
\`\`\`
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
\`\`\`

## Usage
\`\`\`bash
npx cloud-fs-mcp s3 s3://my-bucket --enable-shell
\`\`\`
`,
		],
		[
			"docs/changelog.md",
			`# Changelog

## v0.4.0
- Multi-transport: STDIO, Streamable HTTP, WebSocket
- OAuth 2.1 authentication (builtin + external IdP)
- ext-auth extensions (Client Credentials, Enterprise-Managed)
- Rate limiting, CORS, health checks, structured logging

## v0.3.0
- Added in-memory and SQLite providers
- Interactive shell with 17 POSIX-like commands
- Pipe and redirect support
- xterm.js MCP App for terminal UI

## v0.2.0
- VFS layer with cache coherence
- File search and grep tools
- Redis and filesystem caches

## v0.1.0
- Initial release
- S3, Azure, GCS providers
- Basic read/write/list tools
`,
		],
	];

	// Create directory markers first
	const dirs = ["data/", "src/", "docs/"];
	for (const dir of dirs) {
		await vfs.put(root, dir, Buffer.alloc(0));
	}

	// Write all files
	for (const [key, content] of files) {
		await vfs.put(root, key, Buffer.from(content, "utf8"));
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv);
	const roots = args.rootUris.map(parseUri);

	let provider: StorageProvider;
	if (args.providerName === "s3") {
		provider = new S3Provider({
			...(args.region !== undefined && { region: args.region }),
			...(args.endpoint !== undefined && { endpoint: args.endpoint }),
		});
	} else if (args.providerName === "azure") {
		const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
		if (!connStr) {
			console.error(
				"Error: AZURE_STORAGE_CONNECTION_STRING env var is required for the azure provider.",
			);
			process.exit(1);
		}
		provider = new AzureProvider({ connectionString: connStr });
	} else if (args.providerName === "memory") {
		provider = new MemoryProvider();
	} else if (args.providerName === "sqlite") {
		provider = new SqliteProvider({ dbPath: args.sqliteDb! });
	} else {
		provider = new GcsProvider({
			...(process.env.GOOGLE_CLOUD_PROJECT && {
				projectId: process.env.GOOGLE_CLOUD_PROJECT,
			}),
			...(args.gcsEndpoint !== undefined && { apiEndpoint: args.gcsEndpoint }),
		});
	}

	const cacheOpts = {
		ttlMs: args.cacheTtlMs,
		syncDebounceMs: args.syncDebounceMs,
	};
	let cache: CacheStore;

	if (args.noCache) {
		cache = new PassThroughCache(provider);
	} else if (args.cacheStore === "fs") {
		cache = new FilesystemStore(provider, args.cacheDir!, cacheOpts);
	} else if (args.cacheStore === "redis") {
		const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
		cache = await createRedisStore(provider, redisUrl, cacheOpts);
	} else {
		cache = new MemoryStore(provider, cacheOpts);
	}

	// Create VFS overlay and hydrate persisted metadata
	const vfs = new VirtualFS(provider, cache);
	await vfs.hydrate();

	// Optionally seed demo content
	if (args.seedDemo) {
		await seedDemoContent(vfs, roots);
		console.error(
			"Demo content seeded — try: ls, cat README.md, grep TODO, find -name *.ts",
		);
	}

	const flushAndExit = async (signal: string): Promise<void> => {
		console.error(`\nReceived ${signal}, flushing dirty cache entries...`);
		try {
			await vfs.flush();
		} catch (err) {
			console.error("Flush error:", err);
		}
		process.exit(0);
	};
	process.on("SIGTERM", () => {
		void flushAndExit("SIGTERM");
	});
	process.on("SIGINT", () => {
		void flushAndExit("SIGINT");
	});

	const server = await createMcpServer({
		vfs,
		roots,
		enableDelete: args.enableDelete,
		grepMaxObjects: args.grepMaxObjects,
		enableShell: args.enableShell,
	});

	// Create and start the selected transport
	const managed = await createTransport(args.transport, {
		port: args.port,
		host: args.host,
		corsOrigins: args.corsOrigins,
		auth: args.auth,
		authIssuer: args.authIssuer,
		authJwksUri: args.authJwksUri,
		authAudience: args.authAudience,
		authClientCredentials: args.authClientCredentials,
		authEnterpriseIdp: args.authEnterpriseIdp,
		rateLimit: args.rateLimit,
		rateLimitBurst: args.rateLimitBurst,
		requestLogging: args.requestLogging,
	});
	await managed.start(server);

	console.error(
		`cloud-fs-mcp started — transport: ${args.transport}, provider: ${args.providerName}, roots: ${args.rootUris.join(", ")}`,
	);
}

main().catch((err: unknown) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

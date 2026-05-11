#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FilesystemStore } from "./cache/filesystem.js";
import type { CacheStore } from "./cache/interface.js";
import { MemoryStore } from "./cache/memory.js";
import { PassThroughCache } from "./cache/passthrough.js";
import { createRedisStore } from "./cache/redis.js";
import { parseUri } from "./path-utils.js";
import { AzureProvider } from "./providers/azure.js";
import { GcsProvider } from "./providers/gcs.js";
import type { StorageProvider } from "./providers/interface.js";
import { S3Provider } from "./providers/s3.js";
import { createMcpServer } from "./server.js";

function usage(): never {
	console.error(`Usage: cloud-fs-mcp <s3|azure|gcs> <root-uri> [root-uri...] [options]

Options:
  --region <region>               Provider region (S3, GCS)
  --endpoint <url>                Custom endpoint (S3-compatible: MinIO, RustFS)
  --cache-store <memory|fs|redis> Cache backend (default: memory)
  --cache-ttl <seconds>           Cache TTL in seconds (default: 60)
  --sync-debounce <ms>            Write debounce window in ms (default: 2000)
  --cache-dir <path>              Required when --cache-store fs
  --no-cache                      Disable caching (pass-through mode)
  --enable-delete                 Enable the delete_file tool (disabled by default)
  --grep-max-objects <n>          Max objects grep_files will scan per call (default: 1000)
  --gcs-endpoint <url>            Custom endpoint for GCS (e.g. fake-gcs-server for testing)

Credentials are always sourced from SDK credential chains (env, ~/.aws, ADC, etc.).
Redis URL via env: REDIS_URL (default: redis://localhost:6379)
`);
	process.exit(1);
}

interface CliArgs {
	providerName: "s3" | "azure" | "gcs";
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
}

function parseArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);
	if (args.length < 2) usage();

	const providerArg = args[0]!;
	if (providerArg !== "s3" && providerArg !== "azure" && providerArg !== "gcs")
		usage();

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

	for (let i = 1; i < args.length; i++) {
		const arg = args[i]!;
		if (
			arg.startsWith("s3://") ||
			arg.startsWith("az://") ||
			arg.startsWith("gs://")
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
				console.error(`Invalid --grep-max-objects value: must be a positive integer`);
				usage();
			}
			grepMaxObjects = val;
		} else if (arg === "--gcs-endpoint") {
			gcsEndpoint = args[++i];
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

	return {
		providerName: providerArg,
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
	};
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

	const flushAndExit = async (signal: string): Promise<void> => {
		console.error(`\nReceived ${signal}, flushing dirty cache entries...`);
		try {
			await cache.flush();
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

	const server = createMcpServer({
		provider,
		cache,
		roots,
		enableDelete: args.enableDelete,
		grepMaxObjects: args.grepMaxObjects,
	});
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(
		`cloud-fs-mcp started — provider: ${args.providerName}, roots: ${args.rootUris.join(", ")}`,
	);
}

main().catch((err: unknown) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

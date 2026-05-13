// src/bootstrap.ts
// Shared VFS initialization — used by both the MCP server (index.ts)
// and the interactive TUI (cli-tui.ts).

import { readFileSync } from "node:fs";
import { FilesystemStore } from "./cache/filesystem.js";
import type { CacheStore } from "./cache/interface.js";
import { MemoryStore } from "./cache/memory.js";
import { PassThroughCache } from "./cache/passthrough.js";
import { createRedisStore } from "./cache/redis.js";
import { AzureProvider } from "./providers/azure.js";
import { GcsProvider } from "./providers/gcs.js";
import type { ParsedRoot, StorageProvider } from "./providers/interface.js";
import { MemoryProvider } from "./providers/memory.js";
import { S3Provider } from "./providers/s3.js";
import { VirtualFS } from "./vfs.js";

// nosemgrep: redis-unencrypted-transport — help text documenting the default, not a connection
const DEFAULT_REDIS_URL = "redis://localhost:6379";

export interface BootstrapArgs {
	providerName: "s3" | "azure" | "gcs" | "memory" | "sqlite";
	rootUris: string[];
	region?: string;
	endpoint?: string;
	cacheStore: "memory" | "fs" | "redis";
	cacheTtlMs: number;
	syncDebounceMs: number;
	cacheDir?: string;
	noCache: boolean;
	gcsEndpoint?: string;
	sqliteDb?: string;
	caFile?: string;
}

export interface BootstrapResult {
	vfs: VirtualFS;
	roots: ParsedRoot[];
	/** Flush VFS and clean up connections. Call on shutdown. */
	cleanup: () => Promise<void>;
}

/**
 * Build a VFS instance from CLI-style arguments.
 * Returns the VFS, parsed roots, and a cleanup function for graceful shutdown.
 */
export async function buildVfs(
	args: BootstrapArgs,
	roots: ParsedRoot[],
): Promise<BootstrapResult> {
	// Read custom CA PEM once and pass to providers that support it.
	let caPem: Buffer | undefined;
	if (args.caFile) {
		try {
			caPem = readFileSync(args.caFile);
		} catch {
			throw new Error(`Cannot read --ca-file: ${args.caFile}`);
		}
		if (!caPem.toString().includes("-----BEGIN")) {
			throw new Error(
				`--ca-file does not appear to be a valid PEM file: ${args.caFile}`,
			);
		}
	}

	let provider: StorageProvider;
	if (args.providerName === "s3") {
		provider = new S3Provider({
			...(args.region !== undefined && { region: args.region }),
			...(args.endpoint !== undefined && { endpoint: args.endpoint }),
			...(caPem !== undefined && { caPem }),
		});
	} else if (args.providerName === "azure") {
		const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
		if (!connStr) {
			throw new Error(
				"AZURE_STORAGE_CONNECTION_STRING env var is required for the azure provider.",
			);
		}
		provider = new AzureProvider({ connectionString: connStr });
	} else if (args.providerName === "memory") {
		provider = new MemoryProvider();
	} else if (args.providerName === "sqlite") {
		if (!args.sqliteDb)
			throw new Error("--sqlite-db is required for the sqlite provider.");
		// Dynamic import: SQLite drivers (bun:sqlite / better-sqlite3) may not be
		// available in all runtimes, so we avoid loading at module level.
		const { SqliteProvider } = await import("./providers/sqlite.js");
		provider = await SqliteProvider.create({ dbPath: args.sqliteDb });
	} else {
		provider = new GcsProvider({
			...(process.env.GOOGLE_CLOUD_PROJECT && {
				projectId: process.env.GOOGLE_CLOUD_PROJECT,
			}),
			...(args.gcsEndpoint !== undefined && {
				apiEndpoint: args.gcsEndpoint,
			}),
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
		if (!args.cacheDir)
			throw new Error("--cache-dir is required when --cache-store fs is set.");
		cache = new FilesystemStore(provider, args.cacheDir, cacheOpts);
	} else if (args.cacheStore === "redis") {
		const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
		// nosemgrep: redis-unencrypted-transport — intentional check to warn about unencrypted transport
		if (redisUrl.startsWith("redis://")) {
			console.warn(
				// nosemgrep: redis-unencrypted-transport
				"⚠  Redis connection uses unencrypted redis:// transport. " +
					"Set REDIS_URL=rediss://... for TLS in production.",
			);
		}
		cache = await createRedisStore(provider, redisUrl, cacheOpts, caPem);
	} else {
		cache = new MemoryStore(provider, cacheOpts);
	}

	const vfs = new VirtualFS(provider, cache);
	await vfs.hydrate();

	const cleanup = async () => {
		try {
			await vfs.flush();
		} catch (err) {
			console.error("Flush error:", err);
		}
	};

	return { vfs, roots, cleanup };
}

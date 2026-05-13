#!/usr/bin/env node
// src/cli-tui.ts
// Entry point for the `cloud-fs` interactive shell binary.
// Reuses the same provider/cache/VFS stack as the MCP server,
// but launches a terminal REPL instead of an MCP transport.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { BootstrapArgs } from "./bootstrap.js";
import { buildVfs } from "./bootstrap.js";
import { parseUri } from "./path-utils.js";
import { startTui } from "./tui.js";

// ── Config file loader ─────────────────────────────────────────────────────

interface ConfigFile {
	provider?: string;
	roots?: string[];
	region?: string;
	endpoint?: string;
	enableDelete?: boolean;
	gcsEndpoint?: string;
	sqliteDb?: string;
	caFile?: string;
	seedDemo?: boolean;
	cache?: {
		store?: string;
		ttlSeconds?: number;
		syncDebounceMs?: number;
		dir?: string;
		noCache?: boolean;
	};
}

function loadConfigFile(): ConfigFile {
	const paths = [
		resolve("cloud-fs.json"),
		join(homedir(), ".config", "cloud-fs", "config.json"),
	];
	let merged: ConfigFile = {};
	// Load in reverse order so CWD file takes precedence
	for (const p of paths.reverse()) {
		if (existsSync(p)) {
			try {
				const raw = readFileSync(p, "utf8");
				const parsed = JSON.parse(raw) as ConfigFile;
				merged = { ...merged, ...parsed };
			} catch (err) {
				console.error(`Warning: failed to parse config ${p}: ${err}`);
			}
		}
	}
	return merged;
}

// ── Usage ──────────────────────────────────────────────────────────────────

function usage(): never {
	console.error(`Usage: cloud-fs [provider] [root-uri...] [options]

Interactive shell for cloud object storage.

  cloud-fs s3 s3://my-bucket
  cloud-fs memory mem://demo --seed-demo
  cloud-fs                                  (reads cloud-fs.json)

Providers:
  s3      Amazon S3 / S3-compatible (MinIO, RustFS)
  azure   Azure Blob Storage
  gcs     Google Cloud Storage
  memory  In-memory (ephemeral)
  sqlite  SQLite (persistent local)

Options:
  --region <region>          Provider region (S3, GCS)
  --endpoint <url>           Custom endpoint (S3-compatible)
  --enable-delete            Allow rm and mv commands
  --seed-demo                Seed with sample files for exploration
  --sqlite-db <path>         SQLite database file path
  --gcs-endpoint <url>       Custom endpoint for GCS
  --ca-file <path>           PEM CA bundle for S3/Redis TLS
  --cache-store <type>       Cache backend: memory (default), fs, redis
  --cache-ttl <seconds>      Cache TTL (default: 60)
  --cache-dir <path>         Required when --cache-store fs
  --no-cache                 Disable caching

Config file:
  Reads cloud-fs.json from CWD, then ~/.config/cloud-fs/config.json.
  CLI flags override config file values.
`);
	process.exit(1);
}

// ── Arg parsing ────────────────────────────────────────────────────────────

interface TuiCliArgs extends BootstrapArgs {
	enableDelete: boolean;
	seedDemo: boolean;
}

function parseArgs(argv: string[]): TuiCliArgs {
	const config = loadConfigFile();
	const args = argv.slice(2);

	const validProviders = ["s3", "azure", "gcs", "memory", "sqlite"];
	let providerName: string | undefined;
	const rootUris: string[] = [];
	let region: string | undefined = config.region;
	let endpoint: string | undefined = config.endpoint;
	let enableDelete = config.enableDelete ?? false;
	let seedDemo = config.seedDemo ?? false;
	let gcsEndpoint: string | undefined = config.gcsEndpoint;
	let sqliteDb: string | undefined = config.sqliteDb;
	let caFile: string | undefined = config.caFile;
	let cacheStore: "memory" | "fs" | "redis" =
		(config.cache?.store as "memory" | "fs" | "redis") ?? "memory";
	let cacheTtlMs = (config.cache?.ttlSeconds ?? 60) * 1000;
	let syncDebounceMs = config.cache?.syncDebounceMs ?? 2000;
	let cacheDir: string | undefined = config.cache?.dir;
	let noCache = config.cache?.noCache ?? false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (i === 0 && validProviders.includes(arg)) {
			providerName = arg;
		} else if (
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
		} else if (arg === "--enable-delete") {
			enableDelete = true;
		} else if (arg === "--seed-demo") {
			seedDemo = true;
		} else if (arg === "--gcs-endpoint") {
			gcsEndpoint = args[++i];
		} else if (arg === "--sqlite-db") {
			sqliteDb = args[++i];
		} else if (arg === "--ca-file") {
			caFile = args[++i];
		} else if (arg === "--cache-store") {
			const val = args[++i];
			if (val !== "memory" && val !== "fs" && val !== "redis") {
				console.error(`Invalid --cache-store: ${val}`);
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
		} else if (arg === "--help" || arg === "-h") {
			usage();
		} else {
			console.error(`Unknown argument: ${arg}`);
			usage();
		}
	}

	// Fall back to config file values
	if (!providerName) providerName = config.provider;
	if (rootUris.length === 0 && config.roots) rootUris.push(...config.roots);

	if (!providerName || rootUris.length === 0) {
		console.error("Error: provider and at least one root URI required.\n");
		usage();
	}

	return {
		providerName: providerName as TuiCliArgs["providerName"],
		rootUris,
		...(region !== undefined && { region }),
		...(endpoint !== undefined && { endpoint }),
		cacheStore,
		cacheTtlMs,
		syncDebounceMs,
		...(cacheDir !== undefined && { cacheDir }),
		noCache,
		enableDelete,
		...(gcsEndpoint !== undefined && { gcsEndpoint }),
		...(sqliteDb !== undefined && { sqliteDb }),
		seedDemo,
		...(caFile !== undefined && { caFile }),
	};
}

// ── Seed demo content (duplicated from index.ts to avoid coupling) ────────

async function seedDemoContent(
	vfs: import("./vfs.js").VirtualFS,
	roots: import("./providers/interface.js").ParsedRoot[],
): Promise<void> {
	const root = roots[0]!;
	const files: [string, string][] = [
		[
			"README.md",
			"# Cloud FS Demo\n\nWelcome! Try: ls, cat README.md, find -name '*.json'\n",
		],
		[
			"config.json",
			'{\n  "app": "cloud-fs-demo",\n  "version": "0.4.1",\n  "database": { "host": "localhost", "port": 5432 },\n  "features": { "auth": true, "cache_ttl": 300 }\n}\n',
		],
		[
			"data/users.csv",
			"id,name,email,role\n1,Alice,alice@example.com,admin\n2,Bob,bob@example.com,editor\n3,Carol,carol@example.com,viewer\n",
		],
		[
			"logs/server.log",
			"2024-01-15 08:23:01 INFO  Server started on port 3000\n2024-01-15 09:01:33 ERROR Connection timeout to redis:6379\n2024-01-15 10:02:44 ERROR Unhandled exception in /api/users\n",
		],
	];
	for (const dir of ["data/", "logs/"]) {
		await vfs.put(root, dir, Buffer.alloc(0));
	}
	for (const [key, content] of files) {
		await vfs.put(root, key, Buffer.from(content, "utf8"));
	}
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv);
	const roots = args.rootUris.map(parseUri);

	const { vfs, cleanup } = await buildVfs(args, roots);

	if (args.seedDemo) {
		await seedDemoContent(vfs, roots);
		console.error("Demo content seeded.\n");
	}

	await startTui(vfs, roots, cleanup, {
		enableDelete: args.enableDelete,
	});
}

main().catch((err: unknown) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

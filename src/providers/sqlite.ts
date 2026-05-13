// src/providers/sqlite.ts
// SQLite-backed storage provider.
// Supports bun:sqlite (Bun) and better-sqlite3 (Node.js).

import { inferContentType } from "./content-type.js";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

// ── Tiny abstraction over bun:sqlite / better-sqlite3 ──────────────────────

/** Minimal prepared-statement interface shared by both drivers. */
interface Stmt<Row = unknown> {
	get(...params: unknown[]): Row | null | undefined;
	all(...params: unknown[]): Row[];
	run(...params: unknown[]): void;
}

/** Minimal database interface shared by both drivers. */
interface SqliteDb {
	prepare(sql: string): Stmt;
	exec(sql: string): void;
	close(): void;
}

/**
 * Open a SQLite database using the best available driver.
 * Tries bun:sqlite first (zero-dep on Bun), then better-sqlite3 (Node.js).
 */
async function openDatabase(dbPath: string): Promise<SqliteDb> {
	// Attempt 1: bun:sqlite (available when running under Bun)
	try {
		const bunSqlite = await import("bun:sqlite");
		const db = new bunSqlite.Database(dbPath, { create: true });
		db.run("PRAGMA journal_mode = WAL");
		return {
			prepare: (sql: string) => {
				const stmt = db.query(sql);
				return {
					// biome-ignore lint/suspicious/noExplicitAny: bridging bun:sqlite typed params to generic interface
					get: (...params: unknown[]) => stmt.get(...(params as any[])),
					// biome-ignore lint/suspicious/noExplicitAny: bridging bun:sqlite typed params to generic interface
					all: (...params: unknown[]) => stmt.all(...(params as any[])),
					run: (...params: unknown[]) => {
						// biome-ignore lint/suspicious/noExplicitAny: bridging bun:sqlite typed params to generic interface
						stmt.run(...(params as any[]));
					},
				};
			},
			exec: (sql: string) => db.run(sql),
			close: () => db.close(),
		};
	} catch {
		// bun:sqlite not available — fall through
	}

	// Attempt 2: better-sqlite3 (npm install better-sqlite3)
	try {
		// biome-ignore lint/suspicious/noExplicitAny: dynamic require
		const BetterSqlite3 = (await import("better-sqlite3" as any)).default;
		const db = new BetterSqlite3(dbPath);
		db.pragma("journal_mode = WAL");
		return {
			prepare: (sql: string) => {
				const stmt = db.prepare(sql);
				return {
					get: (...params: unknown[]) => stmt.get(...params),
					all: (...params: unknown[]) => stmt.all(...params),
					run: (...params: unknown[]) => {
						stmt.run(...params);
					},
				};
			},
			exec: (sql: string) => db.exec(sql),
			close: () => db.close(),
		};
	} catch {
		// better-sqlite3 not available either
	}

	throw new Error(
		"No SQLite driver found. Install better-sqlite3 (npm install better-sqlite3) " +
			"or run under Bun which includes bun:sqlite.",
	);
}

// ── Provider ────────────────────────────────────────────────────────────────

/**
 * SQLite provider — persistent local storage.
 *
 * Uses bun:sqlite on Bun and better-sqlite3 on Node.js.
 * The database file path is set via the `--sqlite-db` CLI flag.
 * The "bucket" in `ParsedRoot` is used as a namespace column.
 *
 * @example
 * ```ts
 * const provider = await SqliteProvider.create({ dbPath: "/tmp/cloud-fs.db" });
 * const root = parseUri("sqlite://my-bucket");
 * await provider.putObject(root, "hello.txt", Buffer.from("world"));
 * ```
 *
 * @category Providers
 */
export class SqliteProvider implements StorageProvider {
	private readonly db: SqliteDb;

	private constructor(db: SqliteDb) {
		this.db = db;
	}

	/** Factory — opens the database and creates the schema. */
	static async create(opts: { dbPath: string }): Promise<SqliteProvider> {
		const db = await openDatabase(opts.dbPath);
		db.exec(`
			CREATE TABLE IF NOT EXISTS objects (
				bucket TEXT NOT NULL,
				key TEXT NOT NULL,
				content BLOB NOT NULL,
				content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
				size INTEGER NOT NULL DEFAULT 0,
				last_modified TEXT NOT NULL DEFAULT (datetime('now')),
				PRIMARY KEY (bucket, key)
			)
		`);
		return new SqliteProvider(db);
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const row = this.db
			.prepare("SELECT content FROM objects WHERE bucket = ? AND key = ?")
			.get(root.bucket, key) as { content: Buffer | Uint8Array } | null;
		if (!row) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}
		const content = Buffer.from(row.content);
		if (range) {
			return content.subarray(
				range.startByte,
				range.endByte !== undefined ? range.endByte + 1 : undefined,
			);
		}
		return content;
	}

	async putObject(
		root: ParsedRoot,
		key: string,
		content: Buffer,
	): Promise<void> {
		const contentType = await inferContentType(key, content);
		this.db
			.prepare(
				`INSERT OR REPLACE INTO objects (bucket, key, content, content_type, size, last_modified)
				VALUES (?, ?, ?, ?, ?, datetime('now'))`,
			)
			.run(root.bucket, key, content, contentType, content.length);
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		this.db
			.prepare("DELETE FROM objects WHERE bucket = ? AND key = ?")
			.run(root.bucket, key);
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		const src = this.db
			.prepare(
				"SELECT content, content_type FROM objects WHERE bucket = ? AND key = ?",
			)
			.get(root.bucket, srcKey) as {
			content: Buffer | Uint8Array;
			content_type: string;
		} | null;
		if (!src) {
			throw new Error(
				`File not found: ${root.scheme}://${root.bucket}/${srcKey}`,
			);
		}
		const content = Buffer.from(src.content);
		this.db
			.prepare(
				`INSERT OR REPLACE INTO objects (bucket, key, content, content_type, size, last_modified)
				VALUES (?, ?, ?, ?, ?, datetime('now'))`,
			)
			.run(root.bucket, dstKey, content, src.content_type, content.length);
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const row = this.db
			.prepare(
				"SELECT content_type, size, last_modified FROM objects WHERE bucket = ? AND key = ?",
			)
			.get(root.bucket, key) as {
			content_type: string;
			size: number;
			last_modified: string;
		} | null;
		if (!row) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}
		return {
			key,
			size: row.size,
			lastModified: new Date(row.last_modified),
			contentType: row.content_type,
		};
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		const rows = this.db
			.prepare(
				"SELECT key, size, last_modified, content_type FROM objects WHERE bucket = ? AND key LIKE ? ORDER BY key",
			)
			.all(root.bucket, `${prefix}%`) as {
			key: string;
			size: number;
			last_modified: string;
			content_type: string;
		}[];

		const objects: ObjectInfo[] = [];
		const prefixes = new Set<string>();

		for (const row of rows) {
			if (delimiter) {
				const rest = row.key.slice(prefix.length);
				const delimIdx = rest.indexOf(delimiter);
				if (delimIdx !== -1) {
					prefixes.add(prefix + rest.slice(0, delimIdx + delimiter.length));
					continue;
				}
			}
			objects.push({
				key: row.key,
				size: row.size,
				lastModified: new Date(row.last_modified),
				contentType: row.content_type,
			});
		}

		return { objects, prefixes: [...prefixes].sort() };
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		const key = prefix.endsWith("/") ? prefix : `${prefix}/`;
		await this.putObject(root, key, Buffer.alloc(0));
	}

	/** Close the database connection. */
	close(): void {
		this.db.close();
	}
}

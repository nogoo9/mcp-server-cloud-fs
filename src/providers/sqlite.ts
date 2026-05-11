// src/providers/sqlite.ts
// SQLite-backed storage provider using Bun's built-in bun:sqlite. Zero external deps.

import { Database } from "bun:sqlite";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

/**
 * SQLite provider — persistent local storage using bun:sqlite.
 *
 * The database file path is set via the `--sqlite-db` CLI flag.
 * The "bucket" in `ParsedRoot` is used as a namespace column.
 *
 * @example
 * ```ts
 * const provider = new SqliteProvider({ dbPath: "/tmp/cloud-fs.db" });
 * const root = parseUri("sqlite://my-bucket");
 * await provider.putObject(root, "hello.txt", Buffer.from("world"));
 * ```
 */
export class SqliteProvider implements StorageProvider {
	private readonly db: Database;

	constructor(opts: { dbPath: string }) {
		this.db = new Database(opts.dbPath, { create: true });
		this.db.run("PRAGMA journal_mode = WAL");
		this.db.run(`
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
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const row = this.db
			.query<{ content: Buffer }, [string, string]>(
				"SELECT content FROM objects WHERE bucket = ? AND key = ?",
			)
			.get(root.bucket, key);
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
		this.db
			.query(
				`INSERT OR REPLACE INTO objects (bucket, key, content, content_type, size, last_modified)
				VALUES (?, ?, ?, ?, ?, datetime('now'))`,
			)
			.run(root.bucket, key, content, inferContentType(key), content.length);
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		this.db
			.query("DELETE FROM objects WHERE bucket = ? AND key = ?")
			.run(root.bucket, key);
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		const src = this.db
			.query<{ content: Buffer; content_type: string }, [string, string]>(
				"SELECT content, content_type FROM objects WHERE bucket = ? AND key = ?",
			)
			.get(root.bucket, srcKey);
		if (!src) {
			throw new Error(
				`File not found: ${root.scheme}://${root.bucket}/${srcKey}`,
			);
		}
		const content = Buffer.from(src.content);
		this.db
			.query(
				`INSERT OR REPLACE INTO objects (bucket, key, content, content_type, size, last_modified)
				VALUES (?, ?, ?, ?, ?, datetime('now'))`,
			)
			.run(root.bucket, dstKey, content, src.content_type, content.length);
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const row = this.db
			.query<
				{ content_type: string; size: number; last_modified: string },
				[string, string]
			>(
				"SELECT content_type, size, last_modified FROM objects WHERE bucket = ? AND key = ?",
			)
			.get(root.bucket, key);
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
			.query<
				{
					key: string;
					size: number;
					last_modified: string;
					content_type: string;
				},
				[string, string]
			>(
				"SELECT key, size, last_modified, content_type FROM objects WHERE bucket = ? AND key LIKE ? ORDER BY key",
			)
			.all(root.bucket, `${prefix}%`);

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

function inferContentType(key: string): string {
	const ext = key.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		txt: "text/plain",
		md: "text/markdown",
		html: "text/html",
		json: "application/json",
		csv: "text/csv",
		js: "application/javascript",
		ts: "application/typescript",
		xml: "application/xml",
		yaml: "text/yaml",
		yml: "text/yaml",
		png: "image/png",
		jpg: "image/jpeg",
		pdf: "application/pdf",
	};
	return map[ext] ?? "application/octet-stream";
}

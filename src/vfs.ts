// src/vfs.ts
//
// VirtualFS — FUSE-inspired write-back overlay.
// Provides a coherent filesystem view by overlaying an in-memory inode table,
// directory index, and tombstone set on top of the backing StorageProvider.
// All tool handlers use this as their single access point.

import type { CacheStore } from "./cache/interface.js";
import { toCacheKey } from "./path-utils.js";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./providers/interface.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Metadata for a single VFS object (analogous to POSIX `stat`).
 *
 * @category Core
 */
export interface VfsStat {
	size: number;
	lastModified: Date;
	contentType?: string;
}

// ── Persistence keys ───────────────────────────────────────────────────────

const VFS_INODES_KEY = "__vfs__/inodes";
const VFS_DIRINDEX_KEY = "__vfs__/dirIndex";
const VFS_TOMBSTONES_KEY = "__vfs__/tombstones";

// ── Serialization helpers ──────────────────────────────────────────────────

interface SerializedInode {
	size: number;
	lastModified: string; // ISO 8601
	contentType?: string;
}

function serializeInodes(
	inodes: Map<string, VfsStat>,
): Record<string, SerializedInode> {
	const out: Record<string, SerializedInode> = {};
	for (const [k, v] of inodes) {
		out[k] = {
			size: v.size,
			lastModified: v.lastModified.toISOString(),
			...(v.contentType !== undefined && { contentType: v.contentType }),
		};
	}
	return out;
}

function deserializeInodes(
	raw: Record<string, SerializedInode>,
): Map<string, VfsStat> {
	const m = new Map<string, VfsStat>();
	for (const [k, v] of Object.entries(raw)) {
		m.set(k, {
			size: v.size,
			lastModified: new Date(v.lastModified),
			...(v.contentType !== undefined && { contentType: v.contentType }),
		});
	}
	return m;
}

function serializeDirIndex(
	dirIndex: Map<string, Set<string>>,
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [k, v] of dirIndex) {
		out[k] = [...v];
	}
	return out;
}

function deserializeDirIndex(
	raw: Record<string, string[]>,
): Map<string, Set<string>> {
	const m = new Map<string, Set<string>>();
	for (const [k, v] of Object.entries(raw)) {
		m.set(k, new Set(v));
	}
	return m;
}

// ── VirtualFS ──────────────────────────────────────────────────────────────

/**
 * FUSE-inspired write-back overlay filesystem.
 *
 * Provides a coherent filesystem view by overlaying an in-memory inode table,
 * directory index, and tombstone set on top of the backing {@link StorageProvider}.
 * All MCP tool handlers use this as their single access point.
 *
 * @example
 * ```ts
 * const vfs = new VirtualFS(provider, cacheStore);
 * await vfs.hydrate();
 * await vfs.put(root, "hello.txt", Buffer.from("world"));
 * const content = await vfs.get(root, "hello.txt");
 * ```
 *
 * @category Core
 */
export class VirtualFS {
	/** Inode overlay: cacheKey → stat for every object written through this VFS. */
	private inodes = new Map<string, VfsStat>();

	/** Directory index: dirKey → set of object keys known to exist under that dir prefix. */
	private dirIndex = new Map<string, Set<string>>();

	/** Tombstones: cacheKeys of objects removed through this VFS instance. */
	private tombstones = new Set<string>();

	constructor(
		private readonly provider: StorageProvider,
		private readonly cache: CacheStore,
	) {}

	// ── Hydration ────────────────────────────────────────────────────────

	/**
	 * Load persisted VFS metadata from the CacheStore.
	 * Call once after construction. Safe to call on a cold start (keys simply won't exist).
	 */
	async hydrate(): Promise<void> {
		const [rawInodes, rawDirIndex, rawTombstones] = await Promise.all([
			this.cache.get(VFS_INODES_KEY),
			this.cache.get(VFS_DIRINDEX_KEY),
			this.cache.get(VFS_TOMBSTONES_KEY),
		]);

		if (rawInodes !== null) {
			try {
				const parsed = JSON.parse(rawInodes.toString("utf8")) as Record<
					string,
					SerializedInode
				>;
				this.inodes = deserializeInodes(parsed);
			} catch {
				// Corrupted — start fresh
			}
		}

		if (rawDirIndex !== null) {
			try {
				const parsed = JSON.parse(rawDirIndex.toString("utf8")) as Record<
					string,
					string[]
				>;
				this.dirIndex = deserializeDirIndex(parsed);
			} catch {
				// Corrupted — start fresh
			}
		}

		if (rawTombstones !== null) {
			try {
				const parsed = JSON.parse(rawTombstones.toString("utf8")) as string[];
				this.tombstones = new Set(parsed);
			} catch {
				// Corrupted — start fresh
			}
		}
	}

	// ── Read operations ──────────────────────────────────────────────────

	/**
	 * Read file content. Cache-first, then provider fallback.
	 * Throws if the object is tombstoned and not in cache.
	 */
	async get(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const ck = toCacheKey(root, key);

		// Cache hit (includes unflushed writes)
		const cached = await this.cache.get(ck);
		if (cached !== null) {
			if (range) {
				return cached.subarray(
					range.startByte,
					range.endByte !== undefined ? range.endByte + 1 : undefined,
				);
			}
			return cached;
		}

		// Tombstoned and not in cache → gone
		if (this.tombstones.has(ck)) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}

		// Provider fallback
		const buffer = await this.provider.getObject(root, key, range);
		// Only cache full reads (not ranged)
		if (!range) {
			await this.cache.set(ck, buffer);
		}
		return buffer;
	}

	/**
	 * Return stat (metadata) for an object.
	 * Resolution order: inode overlay → cache content size → provider headObject.
	 */
	async stat(root: ParsedRoot, key: string): Promise<VfsStat> {
		const ck = toCacheKey(root, key);

		if (this.tombstones.has(ck)) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}

		// 1. Inode overlay (populated by put / copy)
		const inode = this.inodes.get(ck);
		if (inode) return inode;

		// 2. Derive from cached content
		const cached = await this.cache.get(ck);
		if (cached !== null) {
			return { size: cached.length, lastModified: new Date() };
		}

		// 3. Provider fallback
		const info = await this.provider.headObject(root, key);
		const result: VfsStat = {
			size: info.size,
			lastModified: info.lastModified,
		};
		if (info.contentType !== undefined) result.contentType = info.contentType;
		return result;
	}

	/**
	 * List objects under a prefix. Merges the provider's listing with the
	 * VFS directory index overlay (pending writes) and removes tombstoned entries.
	 */
	async list(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		// 1. Provider listing (source of truth for objects not touched by VFS)
		const providerResult = await this.provider.listObjects(
			root,
			prefix,
			delimiter,
		);

		// Build a mutable copy
		const objectMap = new Map<string, ObjectInfo>();
		for (const obj of providerResult.objects) {
			const ck = toCacheKey(root, obj.key);
			if (!this.tombstones.has(ck)) {
				objectMap.set(obj.key, obj);
			}
		}

		const prefixSet = new Set(providerResult.prefixes);

		// 2. Overlay dirIndex entries matching this prefix
		const dk = this.dirKey(root, prefix);
		const overlayKeys = this.dirIndex.get(dk);
		if (overlayKeys) {
			for (const objKey of overlayKeys) {
				const ck = toCacheKey(root, objKey);
				if (this.tombstones.has(ck)) continue;

				if (delimiter) {
					// With delimiter: check if this key introduces a sub-prefix
					const rest = objKey.slice(prefix.length);
					const slashIdx = rest.indexOf(delimiter);
					if (slashIdx >= 0) {
						// This key is in a sub-directory — emit as prefix
						prefixSet.add(prefix + rest.slice(0, slashIdx + 1));
					} else if (!objectMap.has(objKey)) {
						// Direct child — add as object
						const inode = this.inodes.get(ck);
						const obj: ObjectInfo = {
							key: objKey,
							size: inode?.size ?? 0,
							lastModified: inode?.lastModified ?? new Date(),
						};
						if (inode?.contentType !== undefined)
							obj.contentType = inode.contentType;
						objectMap.set(objKey, obj);
					}
				} else if (!objectMap.has(objKey)) {
					// No delimiter — flat listing
					const inode = this.inodes.get(ck);
					const obj: ObjectInfo = {
						key: objKey,
						size: inode?.size ?? 0,
						lastModified: inode?.lastModified ?? new Date(),
					};
					if (inode?.contentType !== undefined)
						obj.contentType = inode.contentType;
					objectMap.set(objKey, obj);
				}
			}
		}

		// Also check all dirIndex entries whose dirKey starts with the requested prefix
		// but differs (for nested VFS writes).
		for (const [dKey, keys] of this.dirIndex) {
			if (dKey === dk) continue;
			if (!dKey.startsWith(dk)) continue;
			for (const objKey of keys) {
				const ck = toCacheKey(root, objKey);
				if (this.tombstones.has(ck)) continue;

				if (delimiter) {
					// With delimiter: only emit as sub-prefix
					const rest = objKey.slice(prefix.length);
					const slashIdx = rest.indexOf(delimiter);
					if (slashIdx >= 0) {
						prefixSet.add(prefix + rest.slice(0, slashIdx + 1));
					} else if (!objectMap.has(objKey)) {
						const inode = this.inodes.get(ck);
						const obj: ObjectInfo = {
							key: objKey,
							size: inode?.size ?? 0,
							lastModified: inode?.lastModified ?? new Date(),
						};
						if (inode?.contentType !== undefined)
							obj.contentType = inode.contentType;
						objectMap.set(objKey, obj);
					}
				} else if (!objectMap.has(objKey)) {
					const inode = this.inodes.get(ck);
					const obj: ObjectInfo = {
						key: objKey,
						size: inode?.size ?? 0,
						lastModified: inode?.lastModified ?? new Date(),
					};
					if (inode?.contentType !== undefined)
						obj.contentType = inode.contentType;
					objectMap.set(objKey, obj);
				}
			}
		}

		return {
			objects: [...objectMap.values()],
			prefixes: [...prefixSet],
		};
	}

	// ── Write operations ─────────────────────────────────────────────────

	/**
	 * Write content into the VFS. Immediately visible to stat, list, and get.
	 * Content is flushed to the provider asynchronously via the CacheStore debounce.
	 */
	async put(
		root: ParsedRoot,
		key: string,
		buffer: Buffer,
		contentType?: string,
	): Promise<void> {
		const ck = toCacheKey(root, key);

		// Store content in cache and schedule flush
		await this.cache.set(ck, buffer);
		this.cache.markDirty(ck, root, key);

		// Update inode overlay
		this.inodes.set(ck, {
			size: buffer.length,
			lastModified: new Date(),
			...(contentType !== undefined && { contentType }),
		});

		// Register in directory index
		this.registerInDirIndex(root, key);

		// Clear any tombstone (e.g. re-creating a previously deleted file)
		this.tombstones.delete(ck);

		await this.persistMetadata();
	}

	/**
	 * Remove an object. Deletes from provider, tombstones in VFS.
	 * Immediately invisible to stat, list, and get.
	 */
	async remove(root: ParsedRoot, key: string): Promise<void> {
		const ck = toCacheKey(root, key);

		await this.provider.deleteObject(root, key);
		await this.cache.delete(ck);

		this.tombstones.add(ck);
		this.inodes.delete(ck);
		this.removeFromDirIndex(root, key);

		await this.persistMetadata();
	}

	/**
	 * Copy an object. Same-bucket uses server-side copy; cross-bucket uses get+put.
	 * Destination inode and dirIndex are updated immediately.
	 */
	async copy(
		srcRoot: ParsedRoot,
		srcKey: string,
		dstRoot: ParsedRoot,
		dstKey: string,
	): Promise<void> {
		if (srcRoot.bucket === dstRoot.bucket) {
			// Server-side copy
			await this.provider.copyObject(srcRoot, srcKey, dstKey);
			const dstCk = toCacheKey(dstRoot, dstKey);

			// Derive dst inode from src inode or fetch from provider
			const srcCk = toCacheKey(srcRoot, srcKey);
			const srcInode = this.inodes.get(srcCk);
			if (srcInode) {
				this.inodes.set(dstCk, { ...srcInode, lastModified: new Date() });
			}

			// Evict destination from content cache (force re-read from provider)
			await this.cache.delete(dstCk);
			this.tombstones.delete(dstCk);
			this.registerInDirIndex(dstRoot, dstKey);
		} else {
			// Cross-bucket: download + put
			const buffer = await this.get(srcRoot, srcKey);
			await this.put(dstRoot, dstKey, buffer);
		}

		await this.persistMetadata();
	}

	/**
	 * Create a directory prefix placeholder in the provider and register it in the VFS.
	 */
	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		await this.provider.createPrefix(root, prefix);
		// Ensure the prefix shows up in listings
		const dk = this.dirKey(root, prefix.endsWith("/") ? prefix : `${prefix}/`);
		if (!this.dirIndex.has(dk)) {
			this.dirIndex.set(dk, new Set());
		}
		await this.persistMetadata();
	}

	/**
	 * Flush all dirty cache entries to the provider. Called on graceful shutdown.
	 */
	async flush(): Promise<void> {
		await this.cache.flush();
	}

	// ── Persistence ──────────────────────────────────────────────────────

	/**
	 * Serialize the inode table, dirIndex, and tombstones into the CacheStore.
	 * Uses well-known keys. Not marked dirty (metadata, not file content).
	 */
	private async persistMetadata(): Promise<void> {
		await Promise.all([
			this.cache.set(
				VFS_INODES_KEY,
				Buffer.from(JSON.stringify(serializeInodes(this.inodes))),
			),
			this.cache.set(
				VFS_DIRINDEX_KEY,
				Buffer.from(JSON.stringify(serializeDirIndex(this.dirIndex))),
			),
			this.cache.set(
				VFS_TOMBSTONES_KEY,
				Buffer.from(JSON.stringify([...this.tombstones])),
			),
		]);
	}

	// ── Internals ────────────────────────────────────────────────────────

	/** Build a dirIndex key for a given root + prefix. */
	private dirKey(root: ParsedRoot, prefix: string): string {
		return `${root.scheme}://${root.bucket}/${prefix}`;
	}

	/**
	 * Register an object key in the directory index under its parent prefix.
	 * For key "a/b/c.txt", registers "c.txt" under dirKey "s3://bucket/a/b/".
	 */
	private registerInDirIndex(root: ParsedRoot, key: string): void {
		// Find the parent directory prefix
		const lastSlash = key.lastIndexOf("/");
		const parentPrefix = lastSlash >= 0 ? key.slice(0, lastSlash + 1) : "";
		const dk = this.dirKey(root, parentPrefix);

		let set = this.dirIndex.get(dk);
		if (!set) {
			set = new Set();
			this.dirIndex.set(dk, set);
		}
		set.add(key);
	}

	/**
	 * Remove an object key from the directory index.
	 */
	private removeFromDirIndex(root: ParsedRoot, key: string): void {
		const lastSlash = key.lastIndexOf("/");
		const parentPrefix = lastSlash >= 0 ? key.slice(0, lastSlash + 1) : "";
		const dk = this.dirKey(root, parentPrefix);

		const set = this.dirIndex.get(dk);
		if (set) {
			set.delete(key);
			if (set.size === 0) this.dirIndex.delete(dk);
		}
	}
}

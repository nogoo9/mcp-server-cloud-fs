// src/providers/memory.ts
// Fully in-process storage provider for demos and tests. Zero dependencies.

import { inferContentType } from "./content-type.js";
import type {
	ListResult,
	ObjectInfo,
	ObjectMetadata,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

interface StoredObject {
	content: Buffer;
	contentType: string;
	lastModified: Date;
}

/**
 * In-memory provider — all data stored in a Map and lost on process exit.
 *
 * URI format: `mem://bucket-name`
 *
 * @example
 * ```ts
 * const provider = new MemoryProvider();
 * const root = parseUri("mem://demo");
 * await provider.putObject(root, "hello.txt", Buffer.from("world"));
 * ```
 */
export class MemoryProvider implements StorageProvider {
	private readonly store = new Map<string, StoredObject>();

	private storeKey(root: ParsedRoot, key: string): string {
		return `${root.bucket}/${key}`;
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const obj = this.store.get(this.storeKey(root, key));
		if (!obj) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}
		if (range) {
			return obj.content.subarray(
				range.startByte,
				range.endByte !== undefined ? range.endByte + 1 : undefined,
			);
		}
		return obj.content;
	}

	async putObject(
		root: ParsedRoot,
		key: string,
		content: Buffer,
	): Promise<void> {
		this.store.set(this.storeKey(root, key), {
			content,
			contentType: await inferContentType(key, content),
			lastModified: new Date(),
		});
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		this.store.delete(this.storeKey(root, key));
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		const src = this.store.get(this.storeKey(root, srcKey));
		if (!src) {
			throw new Error(
				`File not found: ${root.scheme}://${root.bucket}/${srcKey}`,
			);
		}
		this.store.set(this.storeKey(root, dstKey), {
			content: Buffer.from(src.content),
			contentType: src.contentType,
			lastModified: new Date(),
		});
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const obj = this.store.get(this.storeKey(root, key));
		if (!obj) {
			throw new Error(`File not found: ${root.scheme}://${root.bucket}/${key}`);
		}
		return {
			key,
			size: obj.content.length,
			lastModified: obj.lastModified,
			contentType: obj.contentType,
		};
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		const bucketPrefix = `${root.bucket}/`;
		const objects: ObjectInfo[] = [];
		const prefixes = new Set<string>();

		for (const [storeKey, obj] of this.store) {
			if (!storeKey.startsWith(bucketPrefix)) continue;
			const key = storeKey.slice(bucketPrefix.length);
			if (!key.startsWith(prefix)) continue;

			if (delimiter) {
				const rest = key.slice(prefix.length);
				const delimIdx = rest.indexOf(delimiter);
				if (delimIdx !== -1) {
					prefixes.add(prefix + rest.slice(0, delimIdx + delimiter.length));
					continue;
				}
			}

			objects.push({
				key,
				size: obj.content.length,
				lastModified: obj.lastModified,
				contentType: obj.contentType,
			});
		}

		return {
			objects,
			prefixes: [...prefixes].sort(),
		};
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		const key = prefix.endsWith("/") ? prefix : `${prefix}/`;
		await this.putObject(root, key, Buffer.alloc(0));
	}

	// -- Metadata & Tags --

	private readonly tags = new Map<string, Record<string, string>>();

	async getObjectMetadata(
		root: ParsedRoot,
		key: string,
	): Promise<ObjectMetadata> {
		const info = await this.headObject(root, key);
		const sk = this.storeKey(root, key);
		return {
			...info,
			metadata: info.contentType ? { "content-type": info.contentType } : {},
			tags: this.tags.get(sk) ?? {},
		};
	}

	async setObjectTags(
		root: ParsedRoot,
		key: string,
		tagValues: Record<string, string>,
	): Promise<void> {
		// Verify the object exists
		await this.headObject(root, key);
		this.tags.set(this.storeKey(root, key), { ...tagValues });
	}

	async getObjectTags(
		root: ParsedRoot,
		key: string,
	): Promise<Record<string, string>> {
		// Verify the object exists
		await this.headObject(root, key);
		return this.tags.get(this.storeKey(root, key)) ?? {};
	}
}

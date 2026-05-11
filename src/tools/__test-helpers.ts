// src/tools/__test-helpers.ts
// Shared VFS test fixtures used by all tool tests.

import { mock } from "bun:test";
import type { CacheStore } from "../cache/interface.js";
import type { StorageProvider } from "../providers/interface.js";
import { VirtualFS } from "../vfs.js";

export function makeProvider(
	overrides?: Partial<StorageProvider>,
): StorageProvider {
	return {
		getObject: mock(async (_root, _key) =>
			Buffer.from("line1\nline2\nline3\nline4\nline5"),
		),
		putObject: mock(async () => {}),
		deleteObject: mock(async () => {}),
		copyObject: mock(async () => {}),
		headObject: mock(async (_r, key) => ({
			key,
			size: 29,
			lastModified: new Date(),
			contentType: "text/plain",
		})),
		listObjects: mock(async () => ({ objects: [], prefixes: [] })),
		createPrefix: mock(async () => {}),
		...overrides,
	};
}

export function makeCache(hit: Buffer | null = null): CacheStore {
	// Build a real-ish in-memory cache for VFS to use.
	const store = new Map<string, Buffer>();
	if (hit !== null) {
		// Pre-seed with a wildcard hit (any key returns this buffer).
		// But get() checks the store first.
		return {
			get: mock(async (key: string) => store.get(key) ?? hit),
			set: mock(async (key: string, val: Buffer) => {
				store.set(key, val);
			}),
			markDirty: mock(() => {}),
			isDirty: mock(() => false),
			dirtyEntries: mock(() => []),
			delete: mock(async (key: string) => {
				store.delete(key);
			}),
			clear: mock(async () => {
				store.clear();
			}),
			flush: mock(async () => {}),
		};
	}
	return {
		get: mock(async (key: string) => store.get(key) ?? null),
		set: mock(async (key: string, val: Buffer) => {
			store.set(key, val);
		}),
		markDirty: mock(() => {}),
		isDirty: mock(() => false),
		dirtyEntries: mock(() => []),
		delete: mock(async (key: string) => {
			store.delete(key);
		}),
		clear: mock(async () => {
			store.clear();
		}),
		flush: mock(async () => {}),
	};
}

export function makeVfs(
	provider?: StorageProvider,
	cache?: CacheStore,
): VirtualFS {
	return new VirtualFS(provider ?? makeProvider(), cache ?? makeCache());
}

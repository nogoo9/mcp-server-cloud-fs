// src/cache/filesystem.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedRoot, StorageProvider } from "../providers/interface.js";
import type { CacheStore } from "./interface.js";

interface MetaFile {
	expiresAt: number;
}

interface DirtyMeta {
	root: ParsedRoot;
	key: string;
}

export class FilesystemStore implements CacheStore {
	private readonly dirtyMap = new Map<string, DirtyMeta>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly provider: StorageProvider,
		private readonly cacheDir: string,
		private readonly opts: { ttlMs: number; syncDebounceMs: number },
	) {}

	private dataPath(cacheKey: string): string {
		const hash = createHash("sha256").update(cacheKey).digest("hex");
		return join(this.cacheDir, `${hash}.bin`);
	}

	private metaPath(cacheKey: string): string {
		const hash = createHash("sha256").update(cacheKey).digest("hex");
		return join(this.cacheDir, `${hash}.meta.json`);
	}

	async get(cacheKey: string): Promise<Buffer | null> {
		try {
			const metaRaw = await readFile(this.metaPath(cacheKey), "utf8");
			const meta: MetaFile = JSON.parse(metaRaw);
			if (Date.now() > meta.expiresAt) {
				await Promise.all([
					unlink(this.dataPath(cacheKey)).catch(() => {}),
					unlink(this.metaPath(cacheKey)).catch(() => {}),
				]);
				return null;
			}
			return await readFile(this.dataPath(cacheKey));
		} catch {
			return null;
		}
	}

	async set(cacheKey: string, value: Buffer): Promise<void> {
		await mkdir(this.cacheDir, { recursive: true });
		const meta: MetaFile = { expiresAt: Date.now() + this.opts.ttlMs };
		await Promise.all([
			writeFile(this.dataPath(cacheKey), value),
			writeFile(this.metaPath(cacheKey), JSON.stringify(meta)),
		]);
	}

	markDirty(cacheKey: string, root: ParsedRoot, key: string): void {
		this.dirtyMap.set(cacheKey, { root, key });
		this.scheduleFlush();
	}

	isDirty(cacheKey: string): boolean {
		return this.dirtyMap.has(cacheKey);
	}

	dirtyEntries(): string[] {
		return [...this.dirtyMap.keys()];
	}

	async delete(cacheKey: string): Promise<void> {
		this.dirtyMap.delete(cacheKey);
		await Promise.all([
			unlink(this.dataPath(cacheKey)).catch(() => {}),
			unlink(this.metaPath(cacheKey)).catch(() => {}),
		]);
	}

	async clear(): Promise<void> {
		this.dirtyMap.clear();
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	async flush(): Promise<void> {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		await this.doFlush();
	}

	private scheduleFlush(): void {
		if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.doFlush();
		}, this.opts.syncDebounceMs);
	}

	private async doFlush(): Promise<void> {
		const entries = [...this.dirtyMap.entries()];
		this.dirtyMap.clear();
		await Promise.all(
			entries.map(async ([cacheKey, { root, key }]) => {
				const buffer = await this.get(cacheKey);
				if (buffer !== null) {
					await this.provider.putObject(root, key, buffer);
				}
			}),
		);
	}
}

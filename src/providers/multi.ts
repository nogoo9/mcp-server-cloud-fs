// src/providers/multi.ts
// Composite provider that routes requests to scheme-specific sub-providers.

import type {
	ListResult,
	ObjectInfo,
	ObjectMetadata,
	ObjectVersion,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

/**
 * A composite StorageProvider that routes operations to the correct
 * sub-provider based on the root's URI scheme.
 *
 * Enables a single server instance to serve multiple cloud backends
 * simultaneously (e.g., S3 + Azure + GCS).
 *
 * @example
 * ```ts
 * const multi = new MultiProvider();
 * multi.register("s3", s3Provider);
 * multi.register("az", azureProvider);
 * // Now `multi` can be used as a single provider for VFS
 * ```
 *
 * @category Providers
 */
export class MultiProvider implements StorageProvider {
	private readonly providers = new Map<string, StorageProvider>();

	/** Register a provider for a URI scheme. */
	register(scheme: string, provider: StorageProvider): void {
		this.providers.set(scheme, provider);
	}

	private resolve(root: ParsedRoot): StorageProvider {
		const p = this.providers.get(root.scheme);
		if (!p) {
			throw new Error(
				`No provider registered for scheme "${root.scheme}". ` +
					`Available: ${[...this.providers.keys()].join(", ") || "(none)"}`,
			);
		}
		return p;
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		return this.resolve(root).getObject(root, key, range);
	}

	async putObject(
		root: ParsedRoot,
		key: string,
		content: Buffer,
	): Promise<void> {
		return this.resolve(root).putObject(root, key, content);
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		return this.resolve(root).deleteObject(root, key);
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		return this.resolve(root).copyObject(root, srcKey, dstKey);
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		return this.resolve(root).headObject(root, key);
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		return this.resolve(root).listObjects(root, prefix, delimiter);
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		return this.resolve(root).createPrefix(root, prefix);
	}

	// -- Optional capability delegation --
	// Each optional method delegates to the sub-provider, throwing if unsupported.

	async getPresignedUrl(
		root: ParsedRoot,
		key: string,
		opts: { expiresIn: number; operation: "get" | "put" },
	): Promise<string> {
		const p = this.resolve(root);
		if (!p.getPresignedUrl) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support presigned URLs.`,
			);
		}
		return p.getPresignedUrl(root, key, opts);
	}

	async getObjectMetadata(
		root: ParsedRoot,
		key: string,
	): Promise<ObjectMetadata> {
		const p = this.resolve(root);
		if (!p.getObjectMetadata) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support object metadata.`,
			);
		}
		return p.getObjectMetadata(root, key);
	}

	async setObjectTags(
		root: ParsedRoot,
		key: string,
		tags: Record<string, string>,
	): Promise<void> {
		const p = this.resolve(root);
		if (!p.setObjectTags) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support setting tags.`,
			);
		}
		return p.setObjectTags(root, key, tags);
	}

	async getObjectTags(
		root: ParsedRoot,
		key: string,
	): Promise<Record<string, string>> {
		const p = this.resolve(root);
		if (!p.getObjectTags) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support getting tags.`,
			);
		}
		return p.getObjectTags(root, key);
	}

	async listObjectVersions(
		root: ParsedRoot,
		key: string,
	): Promise<ObjectVersion[]> {
		const p = this.resolve(root);
		if (!p.listObjectVersions) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support version listing.`,
			);
		}
		return p.listObjectVersions(root, key);
	}

	async restoreObjectVersion(
		root: ParsedRoot,
		key: string,
		versionId: string,
	): Promise<void> {
		const p = this.resolve(root);
		if (!p.restoreObjectVersion) {
			throw new Error(
				`Provider for scheme "${root.scheme}" does not support version restore.`,
			);
		}
		return p.restoreObjectVersion(root, key, versionId);
	}
}

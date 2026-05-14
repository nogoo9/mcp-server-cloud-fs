// src/providers/interface.ts

/**
 * Parsed representation of a storage root URI.
 *
 * Created by {@link parseUri} from a URI string like `s3://my-bucket/my-prefix`.
 *
 * @category Providers
 */
export interface ParsedRoot {
	/** Storage backend scheme. */
	scheme: "s3" | "az" | "gs" | "mem" | "sqlite";
	/** Bucket or container name. */
	bucket: string;
	/** Key prefix — empty string means the entire bucket. */
	prefix: string;
	/** Original URI string, e.g. `"s3://my-bucket/my-prefix"`. */
	uri: string;
}

/**
 * Metadata about a single stored object.
 *
 * @category Providers
 */
export interface ObjectInfo {
	/** Object key relative to the root prefix. */
	key: string;
	/** Size in bytes. */
	size: number;
	/** Last modification timestamp. */
	lastModified: Date;
	/** MIME type, if known. */
	contentType?: string;
}

/**
 * Result of a prefix-delimited object listing.
 *
 * @category Providers
 */
export interface ListResult {
	/** Objects matching the prefix. */
	objects: ObjectInfo[];
	/** Common prefixes ("subdirectories") when a delimiter is used. */
	prefixes: string[];
}

/**
 * Abstract storage backend for cloud object stores.
 *
 * Every provider implements CRUD operations scoped to a {@link ParsedRoot}.
 * Built-in implementations: {@link S3Provider}, {@link AzureProvider},
 * {@link GcsProvider}, {@link MemoryProvider}, {@link SqliteProvider}.
 *
 * @category Providers
 */
export interface StorageProvider {
	getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer>;
	putObject(root: ParsedRoot, key: string, content: Buffer): Promise<void>;
	deleteObject(root: ParsedRoot, key: string): Promise<void>;
	copyObject(root: ParsedRoot, srcKey: string, dstKey: string): Promise<void>;
	headObject(root: ParsedRoot, key: string): Promise<ObjectInfo>;
	listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult>;
	createPrefix(root: ParsedRoot, prefix: string): Promise<void>;

	/**
	 * Generate a presigned URL for temporary access to an object.
	 * Not all providers support this — check before calling.
	 */
	getPresignedUrl?(
		root: ParsedRoot,
		key: string,
		opts: {
			/** URL validity in seconds. */
			expiresIn: number;
			/** 'get' for download, 'put' for upload. */
			operation: "get" | "put";
		},
	): Promise<string>;

	/** Get extended metadata and tags for an object. */
	getObjectMetadata?(root: ParsedRoot, key: string): Promise<ObjectMetadata>;

	/** Set tags on an object. Replaces all existing tags. */
	setObjectTags?(
		root: ParsedRoot,
		key: string,
		tags: Record<string, string>,
	): Promise<void>;

	/** Get tags for an object. */
	getObjectTags?(
		root: ParsedRoot,
		key: string,
	): Promise<Record<string, string>>;
}

/**
 * Extended metadata for a cloud object, including custom headers and tags.
 *
 * @category Providers
 */
export interface ObjectMetadata extends ObjectInfo {
	/** Custom metadata headers (e.g. x-amz-meta-*). */
	metadata: Record<string, string>;
	/** Object tags (key-value pairs for classification). */
	tags: Record<string, string>;
}

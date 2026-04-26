// src/providers/interface.ts

export interface ParsedRoot {
	scheme: "s3" | "az" | "gs";
	bucket: string;
	prefix: string; // empty string = whole bucket
	uri: string; // original URI string, e.g. "s3://my-bucket/my-prefix"
}

export interface ObjectInfo {
	key: string;
	size: number;
	lastModified: Date;
	contentType?: string;
}

export interface ListResult {
	objects: ObjectInfo[];
	prefixes: string[]; // "subdirectory" common prefixes
}

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
}

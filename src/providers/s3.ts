// src/providers/s3.ts
import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	type GetObjectCommandOutput,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type PutObjectCommandInput,
	S3Client,
} from "@aws-sdk/client-s3";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

export class S3Provider implements StorageProvider {
	private readonly client: S3Client;
	/** Default fields merged into every PutObjectCommand (excluding Bucket/Key/Body/ContentType). */
	private readonly defaultPutOptions: Omit<
		PutObjectCommandInput,
		"Bucket" | "Key" | "Body" | "ContentType"
	>;

	constructor(opts: {
		region?: string;
		endpoint?: string;
		/** Override defaults for every PutObject call (e.g. `{ ServerSideEncryption: 'AES256' }`). */
		putOptions?: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body" | "ContentType">;
	}) {
		this.client = new S3Client({
			region: opts.region ?? "us-east-1",
			...(opts.endpoint && {
				endpoint: opts.endpoint,
				forcePathStyle: true,
			}),
		});
		this.defaultPutOptions = opts.putOptions ?? {};
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const rangeHeader = range
			? `bytes=${range.startByte}-${range.endByte ?? ""}`
			: undefined;
		let resp: GetObjectCommandOutput;
		try {
			resp = await this.client.send(
				new GetObjectCommand({
					Bucket: root.bucket,
					Key: key,
					Range: rangeHeader,
				}),
			);
		} catch (err: unknown) {
			const code = (err as { name?: string }).name;
			if (code === "NoSuchKey" || code === "NotFound") {
				throw new Error(
					`File not found: ${root.scheme}://${root.bucket}/${key}`,
				);
			}
			throw err;
		}
		return streamToBuffer(resp.Body as AsyncIterable<Uint8Array>);
	}

	async putObject(
		root: ParsedRoot,
		key: string,
		content: Buffer,
	): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				...this.defaultPutOptions,
				Bucket: root.bucket,
				Key: key,
				Body: content,
				ContentType: inferContentType(key),
			}),
		);
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: root.bucket, Key: key }),
		);
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		await this.client.send(
			new CopyObjectCommand({
				Bucket: root.bucket,
				CopySource: `${root.bucket}/${srcKey}`,
				Key: dstKey,
			}),
		);
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const resp = await this.client.send(
			new HeadObjectCommand({ Bucket: root.bucket, Key: key }),
		);
		return {
			key,
			size: resp.ContentLength ?? 0,
			lastModified: resp.LastModified ?? new Date(),
			...(resp.ContentType !== undefined && { contentType: resp.ContentType }),
		};
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		const objects: ObjectInfo[] = [];
		const prefixes: string[] = [];
		let continuationToken: string | undefined;

		do {
			const resp = await this.client.send(
				new ListObjectsV2Command({
					Bucket: root.bucket,
					Prefix: prefix || undefined,
					Delimiter: delimiter,
					ContinuationToken: continuationToken,
				}),
			);
			for (const obj of resp.Contents ?? []) {
				if (obj.Key) {
					objects.push({
						key: obj.Key,
						size: obj.Size ?? 0,
						lastModified: obj.LastModified ?? new Date(),
					});
				}
			}
			for (const cp of resp.CommonPrefixes ?? []) {
				if (cp.Prefix) prefixes.push(cp.Prefix);
			}
			continuationToken = resp.NextContinuationToken;
		} while (continuationToken);

		return { objects, prefixes };
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		const key = prefix.endsWith("/") ? prefix : `${prefix}/`;
		await this.client.send(
			new PutObjectCommand({
				Bucket: root.bucket,
				Key: key,
				Body: Buffer.alloc(0),
			}),
		);
	}
}

async function streamToBuffer(
	stream: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks);
}

function inferContentType(key: string): string {
	const ext = key.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		txt: "text/plain",
		md: "text/markdown",
		html: "text/html",
		htm: "text/html",
		css: "text/css",
		csv: "text/csv",
		js: "application/javascript",
		ts: "application/typescript",
		json: "application/json",
		xml: "application/xml",
		yaml: "text/yaml",
		yml: "text/yaml",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
		pdf: "application/pdf",
		zip: "application/zip",
	};
	return map[ext] ?? "application/octet-stream";
}

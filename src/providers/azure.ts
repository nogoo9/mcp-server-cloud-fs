// src/providers/azure.ts
import {
	BlobServiceClient,
	StorageSharedKeyCredential,
} from "@azure/storage-blob";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

export class AzureProvider implements StorageProvider {
	private readonly client: BlobServiceClient;

	constructor(opts: {
		connectionString?: string;
		accountName?: string;
		accountKey?: string;
	}) {
		if (opts.connectionString) {
			this.client = BlobServiceClient.fromConnectionString(
				opts.connectionString,
			);
		} else if (opts.accountName && opts.accountKey) {
			const cred = new StorageSharedKeyCredential(
				opts.accountName,
				opts.accountKey,
			);
			this.client = new BlobServiceClient(
				`https://${opts.accountName}.blob.core.windows.net`,
				cred,
			);
		} else {
			throw new Error(
				"AzureProvider requires either connectionString or both accountName and accountKey. " +
					"For DefaultAzureCredential, set AZURE_STORAGE_CONNECTION_STRING.",
			);
		}
	}

	async ensureContainer(containerName: string): Promise<void> {
		await this.client.getContainerClient(containerName).createIfNotExists();
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const blobClient = this.client
			.getContainerClient(root.bucket)
			.getBlobClient(key);
		const offset = range?.startByte ?? 0;
		const count =
			range?.endByte !== undefined ? range.endByte - offset + 1 : undefined;
		try {
			const download = await blobClient.download(offset, count);
			const stream = download.readableStreamBody;
			if (!stream)
				throw new Error(
					`File not found: ${root.scheme}://${root.bucket}/${key}`,
				);
			return streamToBuffer(stream as unknown as AsyncIterable<Uint8Array>);
		} catch (err: unknown) {
			const status = (err as { statusCode?: number }).statusCode;
			if (status === 404)
				throw new Error(
					`File not found: ${root.scheme}://${root.bucket}/${key}`,
				);
			throw err;
		}
	}

	async putObject(
		root: ParsedRoot,
		key: string,
		content: Buffer,
	): Promise<void> {
		const blobClient = this.client
			.getContainerClient(root.bucket)
			.getBlockBlobClient(key);
		await blobClient.upload(content, content.length, {
			blobHTTPHeaders: { blobContentType: inferContentType(key) },
		});
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		await this.client
			.getContainerClient(root.bucket)
			.getBlobClient(key)
			.delete();
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		const srcUrl = this.client
			.getContainerClient(root.bucket)
			.getBlobClient(srcKey).url;
		const dstClient = this.client
			.getContainerClient(root.bucket)
			.getBlobClient(dstKey);
		const op = await dstClient.beginCopyFromURL(srcUrl);
		await op.pollUntilDone();
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const props = await this.client
			.getContainerClient(root.bucket)
			.getBlobClient(key)
			.getProperties();
		return {
			key,
			size: props.contentLength ?? 0,
			lastModified: props.lastModified ?? new Date(),
			...(props.contentType !== undefined && {
				contentType: props.contentType,
			}),
		};
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		const containerClient = this.client.getContainerClient(root.bucket);
		const objects: ObjectInfo[] = [];
		const prefixes: string[] = [];

		if (delimiter) {
			for await (const item of containerClient.listBlobsByHierarchy(delimiter, {
				prefix,
			})) {
				if (item.kind === "prefix") {
					prefixes.push(item.name);
				} else {
					objects.push({
						key: item.name,
						size: item.properties.contentLength ?? 0,
						lastModified: item.properties.lastModified ?? new Date(),
						...(item.properties.contentType !== undefined && {
							contentType: item.properties.contentType,
						}),
					});
				}
			}
		} else {
			for await (const item of containerClient.listBlobsFlat({ prefix })) {
				objects.push({
					key: item.name,
					size: item.properties.contentLength ?? 0,
					lastModified: item.properties.lastModified ?? new Date(),
					...(item.properties.contentType !== undefined && {
						contentType: item.properties.contentType,
					}),
				});
			}
		}

		return { objects, prefixes };
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		const key = prefix.endsWith("/") ? prefix : `${prefix}/`;
		await this.putObject(root, key, Buffer.alloc(0));
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
		css: "text/css",
		js: "application/javascript",
		json: "application/json",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		pdf: "application/pdf",
		zip: "application/zip",
	};
	return map[ext] ?? "application/octet-stream";
}

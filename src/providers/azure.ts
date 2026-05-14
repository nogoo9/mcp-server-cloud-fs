// src/providers/azure.ts

import {
	BlobServiceClient,
	type BlockBlobUploadOptions,
	StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { mapAzureError } from "../errors.js";
import { inferContentType } from "./content-type.js";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

/**
 * Azure Blob Storage provider using the Azure Storage SDK.
 *
 * URI format: `az://container-name/optional-prefix`
 *
 * Supports connection string or account name + key authentication,
 * with configurable upload options (e.g. access tier).
 *
 * @category Providers
 */
export class AzureProvider implements StorageProvider {
	private readonly client: BlobServiceClient;
	/** Default options merged into every BlockBlobClient.upload() call. */
	private readonly defaultUploadOptions: BlockBlobUploadOptions;

	constructor(opts: {
		connectionString?: string;
		accountName?: string;
		accountKey?: string;
		/** Override defaults for every upload call (e.g. `{ tier: 'Cool' }`). */
		uploadOptions?: BlockBlobUploadOptions;
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
		} else if (opts.accountName) {
			// Managed Identity / OIDC / DefaultAzureCredential fallback.
			// Requires @azure/identity as an optional peer dependency.
			// biome-ignore lint/suspicious/noExplicitAny: dynamic optional dependency
			let DefaultAzureCredential: any;
			try {
				// biome-ignore lint/suspicious/noExplicitAny: dynamic optional dependency
				DefaultAzureCredential = (require("@azure/identity") as any)
					.DefaultAzureCredential;
			} catch {
				throw new Error(
					"AzureProvider: @azure/identity is required for Managed Identity / OIDC auth. " +
						"Install it with: npm install @azure/identity",
				);
			}
			this.client = new BlobServiceClient(
				`https://${opts.accountName}.blob.core.windows.net`,
				new DefaultAzureCredential(),
			);
		} else {
			throw new Error(
				"AzureProvider requires connectionString, accountName + accountKey, " +
					"or accountName alone (for DefaultAzureCredential / Managed Identity).",
			);
		}
		this.defaultUploadOptions = opts.uploadOptions ?? {};
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
			mapAzureError(err, root.bucket, key);
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
			...this.defaultUploadOptions,
			blobHTTPHeaders: {
				blobContentType: await inferContentType(key, content),
			},
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

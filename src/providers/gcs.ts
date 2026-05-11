// src/providers/gcs.ts
import { Storage, type SaveOptions } from "@google-cloud/storage";
import type {
	ListResult,
	ObjectInfo,
	ParsedRoot,
	StorageProvider,
} from "./interface.js";

export class GcsProvider implements StorageProvider {
	private readonly storage: Storage;
	/** Default options merged into every `.save()` call. */
	private readonly defaultSaveOptions: SaveOptions;

	constructor(opts: {
		projectId?: string;
		keyFilename?: string;
		apiEndpoint?: string;
		/** Override defaults for every `save()` call (e.g. `{ validation: false }`). */
		saveOptions?: SaveOptions;
	}) {
		this.storage = new Storage({
			...(opts.projectId !== undefined && { projectId: opts.projectId }),
			...(opts.keyFilename !== undefined && { keyFilename: opts.keyFilename }),
			...(opts.apiEndpoint !== undefined && {
				apiEndpoint: opts.apiEndpoint,
				// Emulators don't issue real credentials — skip auth.
				projectId: opts.projectId ?? "emulator-project",
			}),
		});

		// When apiEndpoint is set (emulator mode), disable CRC32C validation by
		// default because fake-gcs-server returns inaccurate checksums.
		// Callers can override this by passing explicit saveOptions.
		const emulatorDefaults: SaveOptions =
			opts.apiEndpoint !== undefined ? { validation: false } : {};
		this.defaultSaveOptions = { ...emulatorDefaults, ...opts.saveOptions };
	}

	async ensureBucket(bucketName: string): Promise<void> {
		const bucket = this.storage.bucket(bucketName);
		const [exists] = await bucket.exists();
		if (!exists) await bucket.create();
	}

	async getObject(
		root: ParsedRoot,
		key: string,
		range?: { startByte: number; endByte?: number },
	): Promise<Buffer> {
		const file = this.storage.bucket(root.bucket).file(key);
		try {
			let content: Buffer;
			if (range !== undefined) {
				const downloadOpts: { start: number; end?: number } = {
					start: range.startByte,
				};
				if (range.endByte !== undefined) downloadOpts.end = range.endByte;
				const [data] = await file.download(downloadOpts);
				content = data;
			} else {
				const [data] = await file.download();
				content = data;
			}
			return content;
		} catch (err: unknown) {
			const code = (err as { code?: number }).code;
			if (code === 404)
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
		await this.storage
			.bucket(root.bucket)
			.file(key)
			.save(content, {
				contentType: inferContentType(key),
				...this.defaultSaveOptions,
			});
	}

	async deleteObject(root: ParsedRoot, key: string): Promise<void> {
		await this.storage.bucket(root.bucket).file(key).delete();
	}

	async copyObject(
		root: ParsedRoot,
		srcKey: string,
		dstKey: string,
	): Promise<void> {
		await this.storage
			.bucket(root.bucket)
			.file(srcKey)
			.copy(this.storage.bucket(root.bucket).file(dstKey));
	}

	async headObject(root: ParsedRoot, key: string): Promise<ObjectInfo> {
		const [metadata] = await this.storage
			.bucket(root.bucket)
			.file(key)
			.getMetadata();
		const size = Number(metadata.size ?? 0);
		const updated = metadata.updated;
		const timeCreated = metadata.timeCreated;
		const lastModified =
			updated !== undefined
				? new Date(String(updated))
				: timeCreated !== undefined
					? new Date(String(timeCreated))
					: new Date();
		const result: ObjectInfo = { key, size, lastModified };
		const ct = metadata.contentType;
		if (ct !== undefined) result.contentType = String(ct);
		return result;
	}

	async listObjects(
		root: ParsedRoot,
		prefix: string,
		delimiter?: string,
	): Promise<ListResult> {
		const query: {
			autoPaginate: boolean;
			prefix?: string;
			delimiter?: string;
		} = {
			autoPaginate: true,
		};
		if (prefix) query.prefix = prefix;
		if (delimiter !== undefined) query.delimiter = delimiter;

		const [files, , apiResp] = await this.storage
			.bucket(root.bucket)
			.getFiles(query);

		const objects: ObjectInfo[] = files.map((f) => {
			const size = Number(f.metadata.size ?? 0);
			const updated = f.metadata.updated;
			const timeCreated = f.metadata.timeCreated;
			const lastModified =
				updated !== undefined
					? new Date(String(updated))
					: timeCreated !== undefined
						? new Date(String(timeCreated))
						: new Date();
			const obj: ObjectInfo = { key: f.name, size, lastModified };
			const ct = f.metadata.contentType;
			if (ct !== undefined) obj.contentType = String(ct);
			return obj;
		});

		const prefixes =
			(apiResp as { prefixes?: string[] } | null)?.prefixes ?? [];

		return { objects, prefixes };
	}

	async createPrefix(root: ParsedRoot, prefix: string): Promise<void> {
		const key = prefix.endsWith("/") ? prefix : `${prefix}/`;
		// Use a 1-byte placeholder — 0-byte uploads can trigger checksum edge cases
		// in some GCS emulators.
		await this.putObject(root, key, Buffer.alloc(1));
	}
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

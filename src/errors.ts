// src/errors.ts
// Structured cloud-aware error handling.
// Wraps provider SDK errors with descriptive, actionable messages.

/**
 * Error codes for cloud storage operations.
 *
 * @category Errors
 */
export const CloudErrorCode = {
	RATE_LIMITED: "RATE_LIMITED",
	PERMISSION_DENIED: "PERMISSION_DENIED",
	REGION_MISMATCH: "REGION_MISMATCH",
	BUCKET_NOT_FOUND: "BUCKET_NOT_FOUND",
	OBJECT_NOT_FOUND: "OBJECT_NOT_FOUND",
	NETWORK_ERROR: "NETWORK_ERROR",
	OBJECT_TOO_LARGE: "OBJECT_TOO_LARGE",
	PRECONDITION_FAILED: "PRECONDITION_FAILED",
} as const;

/** A single cloud error code value. @category Errors */
export type CloudErrorCodeValue =
	(typeof CloudErrorCode)[keyof typeof CloudErrorCode];

/**
 * Structured error for cloud storage operations.
 *
 * Provides an error `code` for programmatic handling and a human-readable
 * `message` with actionable context (provider name, bucket, key, suggestions).
 *
 * @category Errors
 */
export class CloudError extends Error {
	constructor(
		public readonly code: CloudErrorCodeValue,
		message: string,
		public readonly provider: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "CloudError";
	}
}

// ── S3 Error Mapping ──────────────────────────────────────────────────────

/** Map an AWS SDK error to a descriptive CloudError. Re-throws unknown errors. */
export function mapS3Error(err: unknown, bucket: string, key?: string): never {
	const name = (err as { name?: string }).name;
	const message = (err as { message?: string }).message ?? String(err);
	const target = key ? `s3://${bucket}/${key}` : `s3://${bucket}`;

	switch (name) {
		case "SlowDown":
		case "Throttling":
		case "TooManyRequestsException":
			throw new CloudError(
				CloudErrorCode.RATE_LIMITED,
				`Rate limited by AWS on ${target}. Retry after a brief delay.`,
				"s3",
			);

		case "AccessDenied":
		case "AllAccessDisabled":
			throw new CloudError(
				CloudErrorCode.PERMISSION_DENIED,
				`Access denied for ${target}. Check IAM policy for s3:${key ? "GetObject/PutObject" : "ListBucket"} permissions.`,
				"s3",
			);

		case "NoSuchBucket":
			throw new CloudError(
				CloudErrorCode.BUCKET_NOT_FOUND,
				`Bucket "${bucket}" does not exist or is not accessible.`,
				"s3",
				{ bucket },
			);

		case "NoSuchKey":
		case "NotFound":
			throw new CloudError(
				CloudErrorCode.OBJECT_NOT_FOUND,
				`File not found: ${target}`,
				"s3",
			);

		case "PermanentRedirect": {
			const region = (err as { region?: string }).region;
			const hint = region
				? ` Bucket is in region "${region}". Use --region ${region}.`
				: " Check the bucket region and use --region.";
			throw new CloudError(
				CloudErrorCode.REGION_MISMATCH,
				`Region mismatch for bucket "${bucket}".${hint}`,
				"s3",
				{ bucket, ...(region && { suggestedRegion: region }) },
			);
		}

		case "EntityTooLarge":
			throw new CloudError(
				CloudErrorCode.OBJECT_TOO_LARGE,
				`Object too large for single PUT on ${target}. Maximum is 5GB.`,
				"s3",
			);

		default: {
			// Network-level errors
			if (
				name === "NetworkingError" ||
				message.includes("ECONNREFUSED") ||
				message.includes("ENOTFOUND") ||
				message.includes("ETIMEDOUT")
			) {
				throw new CloudError(
					CloudErrorCode.NETWORK_ERROR,
					`Network error connecting to S3 for ${target}. Check --endpoint and network connectivity.`,
					"s3",
				);
			}
			throw err;
		}
	}
}

// ── Azure Error Mapping ───────────────────────────────────────────────────

/** Map an Azure SDK error to a descriptive CloudError. Re-throws unknown errors. */
export function mapAzureError(
	err: unknown,
	container: string,
	key?: string,
): never {
	const statusCode = (err as { statusCode?: number }).statusCode;
	const code = (err as { code?: string }).code;
	const message = (err as { message?: string }).message ?? String(err);
	const target = key ? `az://${container}/${key}` : `az://${container}`;

	switch (statusCode) {
		case 403:
			throw new CloudError(
				CloudErrorCode.PERMISSION_DENIED,
				`Access denied for ${target}. Check storage account credentials and RBAC roles.`,
				"azure",
			);

		case 404:
			if (code === "ContainerNotFound") {
				throw new CloudError(
					CloudErrorCode.BUCKET_NOT_FOUND,
					`Container "${container}" does not exist.`,
					"azure",
					{ container },
				);
			}
			throw new CloudError(
				CloudErrorCode.OBJECT_NOT_FOUND,
				`File not found: ${target}`,
				"azure",
			);

		case 429:
			throw new CloudError(
				CloudErrorCode.RATE_LIMITED,
				`Rate limited by Azure Storage on ${target}. Retry after a brief delay.`,
				"azure",
			);

		case 412:
			throw new CloudError(
				CloudErrorCode.PRECONDITION_FAILED,
				`Precondition failed for ${target}. The resource may have been modified.`,
				"azure",
			);

		default: {
			if (
				message.includes("ECONNREFUSED") ||
				message.includes("ENOTFOUND") ||
				message.includes("ETIMEDOUT")
			) {
				throw new CloudError(
					CloudErrorCode.NETWORK_ERROR,
					`Network error connecting to Azure Storage for ${target}. Check connection string and network.`,
					"azure",
				);
			}
			throw err;
		}
	}
}

// ── GCS Error Mapping ─────────────────────────────────────────────────────

/** Map a GCS SDK error to a descriptive CloudError. Re-throws unknown errors. */
export function mapGcsError(err: unknown, bucket: string, key?: string): never {
	const code = (err as { code?: number }).code;
	const message = (err as { message?: string }).message ?? String(err);
	const target = key ? `gs://${bucket}/${key}` : `gs://${bucket}`;

	switch (code) {
		case 403:
			throw new CloudError(
				CloudErrorCode.PERMISSION_DENIED,
				`Access denied for ${target}. Check IAM bindings for storage.objects.get/list permissions.`,
				"gcs",
			);

		case 404:
			if (message.includes("bucket")) {
				throw new CloudError(
					CloudErrorCode.BUCKET_NOT_FOUND,
					`Bucket "${bucket}" does not exist or is not accessible.`,
					"gcs",
					{ bucket },
				);
			}
			throw new CloudError(
				CloudErrorCode.OBJECT_NOT_FOUND,
				`File not found: ${target}`,
				"gcs",
			);

		case 429:
			throw new CloudError(
				CloudErrorCode.RATE_LIMITED,
				`Rate limited by Google Cloud Storage on ${target}. Retry after a brief delay.`,
				"gcs",
			);

		default: {
			if (
				message.includes("ECONNREFUSED") ||
				message.includes("ENOTFOUND") ||
				message.includes("ETIMEDOUT")
			) {
				throw new CloudError(
					CloudErrorCode.NETWORK_ERROR,
					`Network error connecting to GCS for ${target}. Check --gcs-endpoint and network.`,
					"gcs",
				);
			}
			throw err;
		}
	}
}

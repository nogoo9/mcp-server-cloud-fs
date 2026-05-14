// src/errors.test.ts
import { describe, expect, it } from "bun:test";
import {
	CloudError,
	CloudErrorCode,
	mapAzureError,
	mapGcsError,
	mapS3Error,
} from "./errors.js";

describe("CloudError", () => {
	it("constructs with code, message, provider, and details", () => {
		const err = new CloudError(
			CloudErrorCode.RATE_LIMITED,
			"Rate limited",
			"s3",
			{ retryAfter: 5 },
		);
		expect(err.code).toBe("RATE_LIMITED");
		expect(err.message).toBe("Rate limited");
		expect(err.provider).toBe("s3");
		expect(err.details).toEqual({ retryAfter: 5 });
		expect(err.name).toBe("CloudError");
		expect(err).toBeInstanceOf(Error);
	});

	it("works without details", () => {
		const err = new CloudError(
			CloudErrorCode.OBJECT_NOT_FOUND,
			"Not found",
			"azure",
		);
		expect(err.details).toBeUndefined();
	});
});

describe("mapS3Error", () => {
	it("maps SlowDown to RATE_LIMITED", () => {
		const sdk = { name: "SlowDown", message: "Slow down" };
		expect(() => mapS3Error(sdk, "my-bucket", "file.txt")).toThrow(CloudError);
		try {
			mapS3Error(sdk, "my-bucket", "file.txt");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.RATE_LIMITED);
			expect(ce.provider).toBe("s3");
			expect(ce.message).toContain("Rate limited");
		}
	});

	it("maps Throttling to RATE_LIMITED", () => {
		expect(() => mapS3Error({ name: "Throttling" }, "b")).toThrow(CloudError);
	});

	it("maps AccessDenied to PERMISSION_DENIED", () => {
		try {
			mapS3Error({ name: "AccessDenied" }, "bucket", "key");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.PERMISSION_DENIED);
			expect(ce.message).toContain("IAM policy");
		}
	});

	it("maps NoSuchBucket to BUCKET_NOT_FOUND", () => {
		try {
			mapS3Error({ name: "NoSuchBucket" }, "missing-bucket");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.BUCKET_NOT_FOUND);
			expect(ce.message).toContain("missing-bucket");
		}
	});

	it("maps NoSuchKey to OBJECT_NOT_FOUND", () => {
		try {
			mapS3Error({ name: "NoSuchKey" }, "bucket", "missing.txt");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.OBJECT_NOT_FOUND);
			expect(ce.message).toContain("File not found");
		}
	});

	it("maps PermanentRedirect to REGION_MISMATCH with suggestion", () => {
		try {
			mapS3Error({ name: "PermanentRedirect", region: "eu-west-1" }, "bucket");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.REGION_MISMATCH);
			expect(ce.message).toContain("eu-west-1");
			expect(ce.details?.suggestedRegion).toBe("eu-west-1");
		}
	});

	it("maps ECONNREFUSED to NETWORK_ERROR", () => {
		try {
			mapS3Error(
				{ name: "SomeError", message: "connect ECONNREFUSED 127.0.0.1:9000" },
				"bucket",
			);
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.NETWORK_ERROR);
			expect(ce.message).toContain("Network error");
		}
	});

	it("re-throws unknown errors", () => {
		const unknown = new Error("something unexpected");
		expect(() => mapS3Error(unknown, "bucket")).toThrow("something unexpected");
	});
});

describe("mapAzureError", () => {
	it("maps 403 to PERMISSION_DENIED", () => {
		try {
			mapAzureError({ statusCode: 403 }, "container", "blob.txt");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.PERMISSION_DENIED);
			expect(ce.provider).toBe("azure");
		}
	});

	it("maps 404 with ContainerNotFound to BUCKET_NOT_FOUND", () => {
		try {
			mapAzureError(
				{ statusCode: 404, code: "ContainerNotFound" },
				"missing-container",
			);
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.BUCKET_NOT_FOUND);
		}
	});

	it("maps 404 without ContainerNotFound to OBJECT_NOT_FOUND", () => {
		try {
			mapAzureError({ statusCode: 404, code: "BlobNotFound" }, "c", "key");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.OBJECT_NOT_FOUND);
		}
	});

	it("maps 429 to RATE_LIMITED", () => {
		try {
			mapAzureError({ statusCode: 429 }, "container");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.RATE_LIMITED);
		}
	});

	it("re-throws unknown errors", () => {
		expect(() => mapAzureError(new Error("unexpected"), "container")).toThrow(
			"unexpected",
		);
	});
});

describe("mapGcsError", () => {
	it("maps code 403 to PERMISSION_DENIED", () => {
		try {
			mapGcsError({ code: 403, message: "Forbidden" }, "bucket");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.PERMISSION_DENIED);
			expect(ce.provider).toBe("gcs");
		}
	});

	it("maps code 404 with bucket in message to BUCKET_NOT_FOUND", () => {
		try {
			mapGcsError({ code: 404, message: "No such bucket" }, "mybucket");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.BUCKET_NOT_FOUND);
		}
	});

	it("maps code 404 without bucket to OBJECT_NOT_FOUND", () => {
		try {
			mapGcsError({ code: 404, message: "No such object" }, "bucket", "key");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.OBJECT_NOT_FOUND);
		}
	});

	it("maps code 429 to RATE_LIMITED", () => {
		try {
			mapGcsError({ code: 429, message: "Too Many Requests" }, "bucket");
		} catch (e) {
			const ce = e as CloudError;
			expect(ce.code).toBe(CloudErrorCode.RATE_LIMITED);
		}
	});

	it("re-throws unknown errors", () => {
		expect(() => mapGcsError(new Error("unknown"), "bucket")).toThrow(
			"unknown",
		);
	});
});

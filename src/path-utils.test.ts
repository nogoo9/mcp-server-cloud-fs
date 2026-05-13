// src/path-utils.test.ts
import { describe, expect, it } from "bun:test";
import { parseUri, resolveToolPath, toCacheKey } from "./path-utils.js";
import type { ParsedRoot } from "./providers/interface.js";

const roots: ParsedRoot[] = [
	parseUri("s3://my-bucket/allowed-prefix"),
	parseUri("s3://other-bucket"),
];

describe("parseUri", () => {
	it("parses s3 URI with prefix", () => {
		expect(parseUri("s3://my-bucket/some/prefix")).toEqual({
			scheme: "s3",
			bucket: "my-bucket",
			prefix: "some/prefix",
			uri: "s3://my-bucket/some/prefix",
		});
	});

	it("parses s3 URI without prefix", () => {
		expect(parseUri("s3://my-bucket")).toEqual({
			scheme: "s3",
			bucket: "my-bucket",
			prefix: "",
			uri: "s3://my-bucket",
		});
	});

	it("strips trailing slash from prefix", () => {
		expect(parseUri("s3://my-bucket/prefix/").prefix).toBe("prefix");
	});

	it("parses az URI", () => {
		expect(parseUri("az://my-container/prefix").scheme).toBe("az");
	});

	it("parses gs URI", () => {
		expect(parseUri("gs://my-bucket/prefix").scheme).toBe("gs");
	});

	it("throws on invalid URI", () => {
		expect(() => parseUri("not-a-uri")).toThrow("Invalid cloud URI");
	});

	it("throws on unknown scheme", () => {
		expect(() => parseUri("ftp://bucket/key")).toThrow("Invalid cloud URI");
	});
});

describe("resolveToolPath", () => {
	it("resolves path within allowed prefix", () => {
		const result = resolveToolPath(
			roots,
			"s3://my-bucket/allowed-prefix/subdir/file.txt",
		);
		expect(result.key).toBe("allowed-prefix/subdir/file.txt");
		expect(result.root.uri).toBe("s3://my-bucket/allowed-prefix");
	});

	it("resolves path matching prefix exactly", () => {
		const result = resolveToolPath(roots, "s3://my-bucket/allowed-prefix");
		expect(result.key).toBe("allowed-prefix");
	});

	it("resolves path in whole-bucket root", () => {
		const result = resolveToolPath(
			roots,
			"s3://other-bucket/any/path/file.txt",
		);
		expect(result.key).toBe("any/path/file.txt");
		expect(result.root.bucket).toBe("other-bucket");
	});

	it("denies path outside allowed prefix", () => {
		expect(() =>
			resolveToolPath(roots, "s3://my-bucket/other-prefix/file.txt"),
		).toThrow("Access denied: path is outside allowed roots");
	});

	it("denies path in wrong bucket", () => {
		expect(() => resolveToolPath(roots, "s3://evil-bucket/file.txt")).toThrow(
			"Access denied: path is outside allowed roots",
		);
	});

	it("denies cross-scheme injection (az:// against s3 roots)", () => {
		expect(() =>
			resolveToolPath(roots, "az://my-bucket/allowed-prefix/file.txt"),
		).toThrow("Access denied: path is outside allowed roots");
	});

	it("denies .. traversal that escapes prefix", () => {
		expect(() =>
			resolveToolPath(
				roots,
				"s3://my-bucket/allowed-prefix/../../secret/file.txt",
			),
		).toThrow("Access denied: path is outside allowed roots");
	});

	it("allows .. that stays within prefix", () => {
		const result = resolveToolPath(
			roots,
			"s3://my-bucket/allowed-prefix/subdir/../file.txt",
		);
		expect(result.key).toBe("allowed-prefix/file.txt");
	});

	it("normalizes repeated slashes", () => {
		const result = resolveToolPath(roots, "s3://other-bucket/a//b/file.txt");
		expect(result.key).toBe("a/b/file.txt");
	});
});

describe("resolveToolPath — relative paths", () => {
	const prefixedRoots: ParsedRoot[] = [parseUri("s3://my-bucket/data")];
	const rootOnlyRoots: ParsedRoot[] = [parseUri("s3://my-bucket")];

	it("resolves bare filename against first root (no prefix)", () => {
		const result = resolveToolPath(rootOnlyRoots, "config.json");
		expect(result.root.bucket).toBe("my-bucket");
		expect(result.key).toBe("config.json");
	});

	it("resolves bare filename against first root (with prefix)", () => {
		const result = resolveToolPath(prefixedRoots, "config.json");
		expect(result.key).toBe("data/config.json");
	});

	it("resolves subdirectory path", () => {
		const result = resolveToolPath(prefixedRoots, "logs/app.log");
		expect(result.key).toBe("data/logs/app.log");
	});

	it("strips leading slash (root-relative)", () => {
		const result = resolveToolPath(prefixedRoots, "/config.json");
		expect(result.key).toBe("data/config.json");
	});

	it("normalizes ./ prefix", () => {
		const result = resolveToolPath(prefixedRoots, "./config.json");
		expect(result.key).toBe("data/config.json");
	});

	it("allows .. that stays within prefix", () => {
		const result = resolveToolPath(prefixedRoots, "logs/../config.json");
		expect(result.key).toBe("data/config.json");
	});

	it("denies .. that escapes the root prefix", () => {
		expect(() => resolveToolPath(prefixedRoots, "../../etc/passwd")).toThrow(
			"Access denied: path is outside allowed roots",
		);
	});

	it("full URI still works when roots have prefix", () => {
		const result = resolveToolPath(
			prefixedRoots,
			"s3://my-bucket/data/config.json",
		);
		expect(result.key).toBe("data/config.json");
	});
});

describe("toCacheKey", () => {
	it("builds canonical URI from root and key", () => {
		const root = parseUri("s3://my-bucket/prefix");
		expect(toCacheKey(root, "prefix/file.txt")).toBe(
			"s3://my-bucket/prefix/file.txt",
		);
	});
});

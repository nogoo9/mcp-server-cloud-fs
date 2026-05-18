// src/tools/ai-native.test.ts
import { describe, expect, test } from "bun:test";
import { makeProvider, makeVfs } from "./__test-helpers.js";
import { handleGetFileSchema, handleSummarizeFile } from "./ai-native.js";

const root = {
	scheme: "mem" as const,
	bucket: "test",
	prefix: "",
	uri: "mem://test",
};

function ctxWith(content: string) {
	const provider = makeProvider({
		getObject: async () => Buffer.from(content),
		headObject: async (_r, key) => ({
			key,
			size: Buffer.byteLength(content),
			lastModified: new Date(),
			contentType: "text/plain",
		}),
	});
	const vfs = makeVfs(provider);
	return { vfs, roots: [root] };
}

describe("handleGetFileSchema", () => {
	test("detects CSV schema with column types", async () => {
		const csv =
			"id,name,active,created\n1,Alice,true,2024-01-01\n2,Bob,false,2024-02-15\n";
		const ctx = ctxWith(csv);
		const result = await handleGetFileSchema(
			{ path: "mem://test/data.csv" },
			ctx,
		);

		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("csv");
		expect(schema.columnCount).toBe(4);
		expect(schema.rowCount).toBe(2);
		expect(schema.columns[0].name).toBe("id");
		expect(schema.columns[0].inferredType).toBe("integer");
		expect(schema.columns[1].name).toBe("name");
		expect(schema.columns[1].inferredType).toBe("string");
		expect(schema.columns[2].name).toBe("active");
		expect(schema.columns[2].inferredType).toBe("boolean");
		expect(schema.columns[3].name).toBe("created");
		expect(schema.columns[3].inferredType).toBe("date");
	});

	test("detects CSV with empty content", async () => {
		const ctx = ctxWith("");
		const result = await handleGetFileSchema(
			{ path: "mem://test/empty.csv" },
			ctx,
		);
		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("csv");
		expect(schema.columnCount).toBe(0);
	});

	test("detects JSON object schema", async () => {
		const json = '{"name": "Alice", "age": 30, "tags": ["admin"]}';
		const ctx = ctxWith(json);
		const result = await handleGetFileSchema(
			{ path: "mem://test/data.json" },
			ctx,
		);

		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("json");
		expect(schema.rootType).toBe("object");
		expect(schema.keys).toContain("name");
		expect(schema.keys).toContain("age");
		expect(schema.shape.name).toBe("string");
		expect(schema.shape.age).toBe("number");
		expect(schema.shape.tags).toBe("array");
	});

	test("detects JSON array schema", async () => {
		const json = '[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]';
		const ctx = ctxWith(json);
		const result = await handleGetFileSchema(
			{ path: "mem://test/list.json" },
			ctx,
		);

		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("json");
		expect(schema.rootType).toBe("array");
		expect(schema.elementCount).toBe(2);
		expect(schema.shape.id).toBe("number");
		expect(schema.shape.name).toBe("string");
	});

	test("handles invalid JSON gracefully", async () => {
		const ctx = ctxWith("{invalid json}");
		const result = await handleGetFileSchema(
			{ path: "mem://test/bad.json" },
			ctx,
		);
		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("json");
		expect(schema.error).toBe("Invalid JSON");
	});

	test("handles plain text files", async () => {
		const ctx = ctxWith("line1\nline2\nline3\n");
		const result = await handleGetFileSchema(
			{ path: "mem://test/notes.txt" },
			ctx,
		);
		const schema = JSON.parse(result.content[0].text);
		expect(schema.format).toBe("text");
		expect(schema.lineCount).toBe(4); // includes trailing newline empty
	});
});

describe("handleSummarizeFile", () => {
	test("returns summary with head lines", async () => {
		const content = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const ctx = ctxWith(content);
		const result = await handleSummarizeFile(
			{ path: "mem://test/big.txt" },
			ctx,
		);

		const summary = JSON.parse(result.content[0].text);
		expect(summary.lineCount).toBe(50);
		expect(summary.head).toContain("line 1");
		expect(summary.head).toContain("line 20");
		expect(summary.head).not.toContain("line 21");
		expect(summary.tail).toContain("line 50");
		expect(summary.truncated).toBe(true);
	});

	test("custom max_lines", async () => {
		const content = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const ctx = ctxWith(content);
		const result = await handleSummarizeFile(
			{ path: "mem://test/big.txt", max_lines: 5 },
			ctx,
		);

		const summary = JSON.parse(result.content[0].text);
		expect(summary.head).toContain("line 5");
		expect(summary.head).not.toContain("line 6");
	});

	test("short file — no tail section", async () => {
		const content = "line1\nline2\nline3";
		const ctx = ctxWith(content);
		const result = await handleSummarizeFile(
			{ path: "mem://test/short.txt" },
			ctx,
		);

		const summary = JSON.parse(result.content[0].text);
		expect(summary.lineCount).toBe(3);
		expect(summary.tail).toBeUndefined();
		expect(summary.truncated).toBeUndefined();
	});

	test("includes size and content type", async () => {
		const content = "hello world";
		const ctx = ctxWith(content);
		const result = await handleSummarizeFile(
			{ path: "mem://test/hello.txt" },
			ctx,
		);

		const summary = JSON.parse(result.content[0].text);
		expect(summary.size).toBe(Buffer.byteLength(content));
		expect(summary.contentType).toBe("text/plain");
	});
});

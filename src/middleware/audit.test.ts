// src/middleware/audit.test.ts
import { describe, expect, it } from "bun:test";
import { type AuditEntry, AuditLogger, type AuditSink } from "./audit.js";

/** In-memory sink that captures entries for assertions. */
class CaptureSink implements AuditSink {
	readonly entries: AuditEntry[] = [];
	write(entry: AuditEntry): void {
		this.entries.push(entry);
	}
}

describe("AuditLogger", () => {
	it("logs a successful tool invocation", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"read_file",
			{ path: "s3://bucket/file.txt" },
			{ success: true, duration_ms: 42.567 },
		);

		expect(sink.entries).toHaveLength(1);
		const entry = sink.entries[0]!;
		expect(entry.event).toBe("tool_invocation");
		expect(entry.tool).toBe("read_file");
		expect(entry.level).toBe("info");
		expect(entry.success).toBe(true);
		expect(entry.resource).toBe("s3://bucket/file.txt");
		expect(entry.duration_ms).toBe(42.57);
		expect(entry.error).toBeUndefined();
		expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("logs a failed tool invocation with error message", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"write_file",
			{ path: "s3://bucket/data.json", content: "some data" },
			{ success: false, error: "Access denied", duration_ms: 10 },
		);

		const entry = sink.entries[0]!;
		expect(entry.level).toBe("error");
		expect(entry.success).toBe(false);
		expect(entry.error).toBe("Access denied");
		expect(entry.tool).toBe("write_file");
	});

	it("resolves scope for known tools", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"read_file",
			{ path: "s3://b/f" },
			{ success: true, duration_ms: 1 },
		);

		expect(sink.entries[0]!.scope).toBe("cloud-fs:read");
	});

	it("scope is undefined for unknown tools", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall("unknown_tool", {}, { success: true, duration_ms: 1 });

		expect(sink.entries[0]!.scope).toBeUndefined();
	});

	it("extracts resource URI from path arg", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"get_file_info",
			{ path: "gs://my-bucket/docs/readme.md" },
			{ success: true, duration_ms: 5 },
		);

		expect(sink.entries[0]!.resource).toBe("gs://my-bucket/docs/readme.md");
	});

	it("extracts resource URI from source arg", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"copy_file",
			{ source: "s3://a/src.txt", destination: "s3://a/dst.txt" },
			{ success: true, duration_ms: 5 },
		);

		expect(sink.entries[0]!.resource).toBe("s3://a/src.txt");
	});

	it("sanitizes large content bodies", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		const largeContent = "x".repeat(500);
		logger.logToolCall(
			"write_file",
			{ path: "s3://b/f.txt", content: largeContent },
			{ success: true, duration_ms: 1 },
		);

		const args = sink.entries[0]!.args;
		expect(typeof args.content).toBe("string");
		expect((args.content as string).length).toBeLessThan(largeContent.length);
		expect(args.content).toContain("[500 chars]");
	});

	it("preserves small content bodies", () => {
		const sink = new CaptureSink();
		const logger = new AuditLogger(sink);

		logger.logToolCall(
			"write_file",
			{ path: "s3://b/f.txt", content: "small" },
			{ success: true, duration_ms: 1 },
		);

		expect(sink.entries[0]!.args.content).toBe("small");
	});
});

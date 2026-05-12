# Transports

The server supports three MCP transports, selected via the `--transport` flag.

<!-- @image-prompt transport-layers.png: An infographic comparison diagram on a dark navy background showing three transport modes side by side as vertical cards. Card 1 - "STDIO" (teal): Icon: terminal/command line, "Local Development", "Bidirectional pipes", "Single session", "Zero network overhead", "Default mode". Card 2 - "HTTP" (blue): Icon: globe/network, "Remote Deployment", "Streamable HTTP + SSE", "Multi-session (UUID v7)", "OAuth 2.1 + CORS", "Resumable connections". Card 3 - "WebSocket" (purple): Icon: lightning bolt, "Low Latency", "Full duplex", "Persistent connection", "Bun-native", "Ping/pong heartbeat". Clean card layout with subtle glow effects, rounded corners, consistent spacing. Modern tech documentation style. Each card has a colored top border matching its theme color. -->
![Transport comparison showing STDIO, HTTP, and WebSocket modes](/images/transport-layers.png)

| Transport | Flag | Runtime | Use case |
|---|---|---|---|
| **STDIO** | `--transport stdio` (default) | Bun, Node | Local `npx`, Claude Desktop, Claude Code |
| **Streamable HTTP** | `--transport http` | Bun ✅, Node ✅ | Remote deployment, multi-user, enterprise |
| **WebSocket** | `--transport ws` | Bun only | Low-latency bidirectional, real-time apps |

## STDIO (Default)

STDIO is the default transport. The server communicates over stdin/stdout using JSON-RPC messages. This is the standard transport for local MCP clients like Claude Desktop and Claude Code.

```bash
cloud-fs-mcp s3 s3://my-bucket
# equivalent to:
cloud-fs-mcp s3 s3://my-bucket --transport stdio
```

::: tip
STDIO is the simplest and fastest transport for local usage. No network configuration needed.
:::

## Streamable HTTP

Implements the [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) with a single `/mcp` endpoint for POST (requests), GET (SSE notifications), and DELETE (session termination).

### Dual Runtime Support

- **Bun**: Uses `WebStandardStreamableHTTPServerTransport` with `Bun.serve()` directly — zero Express dependency, maximum performance.
- **Node.js**: Falls back to `StreamableHTTPServerTransport` with Express. Requires `express` as an optional peer dependency (`npm install express`).

Runtime is auto-detected at startup.

### Session Management

Sessions use **UUID v7** (RFC 9562) — time-ordered and K-sortable, making them ideal for logging, debugging, and database indexing. Sessions are tracked via the `Mcp-Session-Id` header.

### Resumability

When an EventStore is configured, clients can reconnect and resume receiving messages from where they left off via the `Last-Event-ID` SSE header.

### Examples

```bash
# Basic HTTP server
cloud-fs-mcp s3 s3://my-bucket --transport http --port 3000

# With authentication
cloud-fs-mcp s3 s3://my-bucket --transport http --port 3000 \
  --auth builtin --auth-issuer https://my-server.example.com

# Production deployment
cloud-fs-mcp s3 s3://my-bucket \
  --transport http --port 3000 --host 0.0.0.0 \
  --auth external --auth-jwks-uri https://login.example.com/.well-known/jwks.json \
  --cors-origin https://app.example.com \
  --rate-limit 60 --rate-limit-burst 10 \
  --request-logging
```

## WebSocket

Bun-native WebSocket transport using `Bun.serve()` with WebSocket upgrade handling. Provides lower latency than HTTP for high-frequency tool invocations.

- JSON-RPC message framing over WebSocket
- UUID v7 session assigned on upgrade
- WS ping/pong heartbeat for connection liveness

```bash
cloud-fs-mcp s3 s3://my-bucket --transport ws --port 3000
```

::: warning
WebSocket transport requires **Bun** runtime. It is not supported on Node.js.
:::

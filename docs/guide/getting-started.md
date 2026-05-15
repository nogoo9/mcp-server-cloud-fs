# Getting Started

## Installation

Install `@nogoo9/mcp-server-cloud-fs` globally or use it on-demand with `npx`/`bunx`:

```bash
# On-demand (recommended)
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket

# Global install
npm install -g @nogoo9/mcp-server-cloud-fs
cloud-fs-mcp s3 s3://my-bucket
```

## Quick Start

### Local (STDIO — default)

The simplest way to get started. The server communicates over stdin/stdout:

```bash
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket
```

### Remote (HTTP)

Deploy as a remote server with Streamable HTTP:

```bash
# Bun (zero Express dependency)
bunx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport http --port 3000

# Node.js (requires express peer dep)
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport http --port 3000
```

### Remote (WebSocket — Bun only)

For low-latency bidirectional communication:

```bash
bunx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket --transport ws --port 3000
```

### Demo (no cloud credentials needed)

Try the in-memory provider with pre-seeded sample files:

```bash
bunx @nogoo9/mcp-server-cloud-fs memory mem://demo --enable-shell --seed-demo
```

### Interactive Shell (`cloud-fs`)

Drop into an interactive terminal for exploring and managing cloud storage — no MCP client needed:

```bash
# S3
npx -p @nogoo9/mcp-server-cloud-fs cloud-fs s3 s3://my-bucket

# In-memory demo with sample files
npx -p @nogoo9/mcp-server-cloud-fs cloud-fs memory mem://demo --seed-demo
```

Features: `cd` navigation with dynamic prompt, tab completion, command history, relative paths, 19 built-in commands including `jq`, and pipes/redirects. See the [Interactive Shell guide](/guide/shell) for more details.

### AI Agent Skill

Give your assistant native fluency with cloud storage by installing the `cloud-fs` skill:

```bash
# Claude Code
claude mcp add-skill nogoo9/mcp-server-cloud-fs

# Gemini CLI
npx skills add nogoo9/mcp-server-cloud-fs
```

The skill teaches assistants how to map high-level intents to MCP tools and provides a guided setup flow. See the [AI Agent Skill guide](/guide/ai-skill) for more details.

## MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cloud-fs": {
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3", "s3://my-bucket"]
    }
  }
}
```

### Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nogoo9/mcp-server-cloud-fs", "s3", "s3://my-bucket"]
    }
  }
}
```

### Remote HTTP Client

```json
{
  "mcpServers": {
    "cloud-fs": {
      "type": "streamable-http",
      "url": "https://cloud-fs.example.com/mcp"
    }
  }
}
```

## MCP Inspector

Test and debug with the MCP Inspector:

```bash
# Quick demo (no credentials needed)
bun run inspect:memory

# Custom configuration
bun run inspect -- s3 s3://my-bucket --region us-east-1 --enable-shell
```

## What's Next?

- [Transports](/guide/transports) — learn about STDIO, HTTP, and WebSocket transport modes
- [Authentication](/guide/authentication) — configure OAuth 2.1 for production deployments
- [Provider Setup](/guide/providers) — detailed setup for each cloud provider
- [Tool Reference](/reference/tools) — complete list of all 27 tools

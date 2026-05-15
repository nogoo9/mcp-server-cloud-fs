---
layout: home

hero:
  name: Cloud FS MCP Server
  text: Cloud-native file system for AI
  tagline: Drop-in replacement for mcp-server-filesystem — 27 tools for S3, Azure Blob, and GCS with OAuth 2.1, multi-transport, and a FUSE-inspired VFS.
  # @image-prompt cloud-providers-hero.png: A clean, modern dark-themed hero banner for a cloud filesystem documentation site. Show stylized flat icons for AWS S3 (orange bucket), Azure Blob Storage (blue cloud), Google Cloud Storage (multicolor), MinIO (red), SQLite (blue database), and In-Memory (purple chip) arranged in a semicircle, all connected with subtle glowing gradient lines flowing into a central hexagonal node labeled "Cloud FS". Deep blue-to-purple gradient background with subtle grid pattern. Minimal, professional, tech documentation style. Wide aspect ratio 16:9. No text except "Cloud FS" in the center node.
  image:
    src: /images/cloud-providers-hero.png
    alt: Cloud FS Provider Ecosystem
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nogoo9/mcp-server-cloud-fs
    - theme: alt
      text: npm
      link: https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs

features:
  - icon: ☁️
    title: Multi-Cloud Storage
    details: S3, Azure Blob, GCS, MinIO, RustFS, SQLite, and in-memory providers. Same tool API across all backends.
  - icon: 🔌
    title: Multi-Transport
    details: STDIO for local dev, Streamable HTTP for remote deployment, WebSocket for low-latency — all with session management.
  - icon: 🔐
    title: OAuth 2.1 Authentication
    details: Built-in auth server or external IdP validation. Supports PKCE, Client Credentials (M2M), and Enterprise SSO.
  - icon: 📁
    title: Virtual Filesystem (VFS)
    details: FUSE-inspired write-back overlay with inode tables, directory indexing, and tombstones for instant write visibility.
  - icon: ☁️
    title: Cloud-Native Tools
    details: Presigned URLs, object metadata & tags, tag-based search, version history, and version restore — all via MCP.
  - icon: ⚡
    title: 27 MCP Tools
    details: Full filesystem tool surface — read, write, edit, search, grep, shell — plus byte-range reads, multi-file search, and cloud-native tools.
  - icon: 🏗️
    title: Production Ready
    details: Rate limiting, CORS, health checks, audit logging, structured logging, DNS rebinding protection, and graceful shutdown.
  - icon: 🖥️
    title: Interactive TUI
    details: 'cloud-fs — a terminal shell with cd navigation, tab completion, command history, and 19 built-in commands including jq.'
  - icon: 🤖
    title: AI Agent Skill
    details: 'Installable skill for Claude Code and Gemini CLI that teaches assistants how to use cloud storage as a POSIX filesystem.'
---

## Quick Demo

No cloud credentials needed — try it instantly with the in-memory provider:

```bash
npx @nogoo9/mcp-server-cloud-fs memory mem://demo --enable-shell --seed-demo
```

Or connect to your cloud storage:

```bash
# AWS S3
npx @nogoo9/mcp-server-cloud-fs s3 s3://my-bucket

# Azure Blob Storage
npx @nogoo9/mcp-server-cloud-fs azure az://my-container

# Google Cloud Storage
npx @nogoo9/mcp-server-cloud-fs gcs gs://my-bucket
```

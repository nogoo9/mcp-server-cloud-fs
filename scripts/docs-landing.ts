/**
 * Generates a root index.html landing page for the versioned documentation site.
 * Scans the deployment directory for version directories and PR previews.
 *
 * Usage: bun scripts/docs-landing.ts <deploy-dir>
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const deployDir = process.argv[2];
if (!deployDir) {
	console.error("Usage: bun scripts/docs-landing.ts <deploy-dir>");
	process.exit(1);
}

// Scan for version directories (v0.4.0, v0.5.0, etc.)
const entries = readdirSync(deployDir);
const versions = entries
	.filter((e) => /^v\d+\.\d+\.\d+$/.test(e))
	.filter((e) => statSync(join(deployDir, e)).isDirectory())
	.sort((a, b) => {
		const pa = a
			.slice(1)
			.split(".")
			.map(Number);
		const pb = b
			.slice(1)
			.split(".")
			.map(Number);
		for (let i = 0; i < 3; i++) {
			if (pb[i] !== pa[i]) return pb[i] - pa[i];
		}
		return 0;
	});

// Scan for PR previews
const prDir = join(deployDir, "pr");
let prPreviews: string[] = [];
try {
	prPreviews = readdirSync(prDir)
		.filter((e) => /^\d+$/.test(e))
		.filter((e) => statSync(join(prDir, e)).isDirectory())
		.sort((a, b) => Number(b) - Number(a));
} catch {
	// no pr/ directory yet
}

const latestVersion = versions[0] || "v0.4.0";
const baseUrl = process.env.BASE_URL || "/mcp-server-cloud-fs";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloud FS MCP Server — Documentation</title>
  <meta name="description" content="Cloud replacement for mcp-server-filesystem — versioned documentation">
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #60a5fa;
      --success: #22c55e;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    .container { max-width: 640px; width: 100%; }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      text-align: center;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, var(--primary), #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      text-align: center;
      color: var(--muted);
      margin-bottom: 2rem;
      font-size: 0.95rem;
    }
    .section-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.75rem;
      padding-left: 0.25rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-decoration: none;
      color: var(--text);
      transition: border-color 0.2s, transform 0.15s;
    }
    .card:hover {
      border-color: var(--primary);
      transform: translateY(-1px);
    }
    .card .label { font-weight: 600; font-size: 1.05rem; }
    .card .badge {
      font-size: 0.75rem;
      padding: 0.2em 0.6em;
      border-radius: 6px;
      font-weight: 600;
    }
    .badge-latest { background: rgba(34, 197, 94, 0.15); color: var(--success); }
    .badge-version { background: rgba(59, 130, 246, 0.15); color: var(--primary); }
    .badge-pr { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .section { margin-bottom: 2rem; }
    .empty { color: var(--muted); font-style: italic; padding-left: 0.25rem; font-size: 0.9rem; }
    footer {
      margin-top: auto;
      padding-top: 2rem;
      text-align: center;
      color: var(--muted);
      font-size: 0.8rem;
    }
    footer a { color: var(--primary); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>☁️ Cloud FS MCP Server</h1>
    <p class="subtitle">Cloud replacement for mcp-server-filesystem — Documentation</p>

    <div class="section">
      <div class="section-title">Latest</div>
      <a class="card" href="${baseUrl}/latest/">
        <span class="label">Latest (${latestVersion})</span>
        <span class="badge badge-latest">latest</span>
      </a>
    </div>

    <div class="section">
      <div class="section-title">Stable Releases</div>
      ${
				versions.length > 0
					? versions
							.map(
								(v) => `
      <a class="card" href="${baseUrl}/${v}/">
        <span class="label">${v}</span>
        <span class="badge badge-version">stable</span>
      </a>`,
							)
							.join("\n")
					: '<p class="empty">No versioned releases yet.</p>'
			}
    </div>

    <div class="section">
      <div class="section-title">PR Previews</div>
      ${
				prPreviews.length > 0
					? prPreviews
							.map(
								(pr) => `
      <a class="card" href="${baseUrl}/pr/${pr}/">
        <span class="label">PR #${pr}</span>
        <span class="badge badge-pr">preview</span>
      </a>`,
							)
							.join("\n")
					: '<p class="empty">No open PR previews.</p>'
			}
    </div>
  </div>

  <footer>
    <a href="https://github.com/nogoo9/mcp-server-cloud-fs">GitHub</a> ·
    <a href="https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs">npm</a>
  </footer>
</body>
</html>`;

writeFileSync(join(deployDir, "index.html"), html);
console.log(
	`Landing page generated: ${versions.length} versions, ${prPreviews.length} PR previews`,
);

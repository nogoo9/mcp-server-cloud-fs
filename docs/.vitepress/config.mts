import { defineConfig } from "vitepress";
import typedocSidebar from "../reference/api/typedoc-sidebar.json";
import internalsSidebar from "../reference/internals/typedoc-sidebar.json";

const architectureSidebar = [
	{
		text: "Architecture",
		items: [
			{ text: "Virtual Filesystem", link: "/architecture/vfs" },
			{ text: "Caching", link: "/architecture/caching" },
		],
	},
	{
		text: "Design Records",
		items: [
			{ text: "01. MCP Resources", link: "/designs/01-mcp-resources" },
			{ text: "02. Streaming Chunked Reads", link: "/designs/02-streaming-chunked-reads" },
			{ text: "03. Audit Logging", link: "/designs/03-audit-logging" },
			{ text: "04. Presigned URLs", link: "/designs/04-presigned-urls" },
			{ text: "05. Metadata & Search", link: "/designs/05-metadata-search" },
			{ text: "06. Version Restore", link: "/designs/06-version-restore" },
			{ text: "07. Descriptive Errors", link: "/designs/07-descriptive-errors" },
			{ text: "08. Multi-Provider Routing", link: "/designs/08-multi-provider-routing" },
			{ text: "09. OIDC Managed Identity", link: "/designs/09-oidc-managed-identity" },
			{ text: "10. Health Check UI", link: "/designs/10-health-check-ui" },
		],
	},
];

export default defineConfig({
	title: "Cloud FS MCP Server",
	description:
		"Cloud replacement for mcp-server-filesystem — 27 tools for S3, Azure Blob, and GCS with OAuth 2.1, VFS, and multi-transport support",
	base: process.env.VITEPRESS_BASE || "/mcp-server-cloud-fs/",

	lastUpdated: true,
	cleanUrls: true,

	head: [
		[
			"meta",
			{
				name: "keywords",
				content:
					"MCP, Model Context Protocol, S3, Azure, GCS, filesystem, cloud storage, AI tools",
			},
		],
		[
			"meta",
			{ property: "og:title", content: "Cloud FS MCP Server Documentation" },
		],
		[
			"meta",
			{
				property: "og:description",
				content:
					"Cloud replacement for mcp-server-filesystem with 27 tools, OAuth 2.1, and multi-transport support",
			},
		],
	],

	themeConfig: {
		logo: "/images/cloud-providers-hero.png",

		nav: [
			{ text: "Guide", link: "/guide/getting-started" },
			{ text: "Reference", link: "/reference/cli" },
			{ text: "API", link: "/reference/api/" },
			{ text: "Architecture", link: "/architecture/vfs" },
			{ text: "Development", link: "/development/contributing" },
		],

		sidebar: {
			"/guide/": [
				{
					text: "Guide",
					items: [
						{ text: "Getting Started", link: "/guide/getting-started" },
						{ text: "What's New in v0.6.0", link: "/guide/whats-new" },
						{ text: "Use Cases", link: "/guide/use-cases" },
						{ text: "Provider Setup", link: "/guide/providers" },
						{ text: "AI Agent Skill", link: "/guide/ai-skill" },
						{ text: "Interactive Shell", link: "/guide/shell" },
						{ text: "Transports", link: "/guide/transports" },
						{ text: "Authentication", link: "/guide/authentication" },
						{ text: "Production Hardening", link: "/guide/production" },
					],
				},
			],
			"/reference/api/": [
				{
					text: "API Reference",
					link: "/reference/api/",
					items: typedocSidebar,
				},
			],
			"/reference/internals/": [
				{
					text: "Internals Reference",
					link: "/reference/internals/",
					items: internalsSidebar,
				},
			],
			"/reference/": [
				{
					text: "Reference",
					items: [
						{ text: "CLI Reference", link: "/reference/cli" },
						{ text: "Tool Reference", link: "/reference/tools" },
						{ text: "API Reference", link: "/reference/api/" },
						{ text: "Internals Reference", link: "/reference/internals/" },
					],
				},
			],
			"/architecture/": architectureSidebar,
			"/designs/": architectureSidebar,
			"/development/": [
				{
					text: "Development",
					items: [
						{ text: "Contributing", link: "/development/contributing" },
						{ text: "Testing", link: "/development/testing" },
						{ text: "Changelog", link: "/development/changelog" },
					],
				},
			],
		},

		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/nogoo9/mcp-server-cloud-fs",
			},
			{
				icon: "npm",
				link: "https://www.npmjs.com/package/@nogoo9/mcp-server-cloud-fs",
			},
		],

		search: {
			provider: "local",
		},

		editLink: {
			pattern:
				"https://github.com/nogoo9/mcp-server-cloud-fs/edit/main/docs/:path",
		},

		footer: {
			message: "Released under the PolyForm Shield 1.0.0 License.",
			copyright: "Copyright © 2024-present nogoo9",
		},
	},

	sitemap: {
		hostname: "https://nogoo9.github.io/mcp-server-cloud-fs",
	},
});

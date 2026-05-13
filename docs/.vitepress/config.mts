import { defineConfig } from "vitepress";
import typedocSidebar from "../reference/api/typedoc-sidebar.json";
import internalsSidebar from "../reference/internals/typedoc-sidebar.json";

export default defineConfig({
	title: "Cloud FS MCP Server",
	description:
		"Cloud replacement for mcp-server-filesystem — 20+ tools for S3, Azure Blob, and GCS with OAuth 2.1, VFS, and multi-transport support",
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
					"Cloud replacement for mcp-server-filesystem with 20+ tools, OAuth 2.1, and multi-transport support",
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
						{ text: "Transports", link: "/guide/transports" },
						{ text: "Authentication", link: "/guide/authentication" },
						{ text: "Production Features", link: "/guide/production" },
						{ text: "Provider Setup", link: "/guide/providers" },
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
			"/architecture/": [
				{
					text: "Architecture",
					items: [
						{ text: "Virtual Filesystem", link: "/architecture/vfs" },
						{ text: "Caching", link: "/architecture/caching" },
					],
				},
			],
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

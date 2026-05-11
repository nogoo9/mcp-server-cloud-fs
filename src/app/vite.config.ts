// src/app/vite.config.ts
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = resolve(import.meta.dirname);

export default defineConfig({
	root,
	plugins: [viteSingleFile()],
	build: {
		outDir: resolve(root, "../../dist/app"),
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(root, "shell-app.html"),
		},
	},
});

// src/app/vite.config.ts
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	plugins: [viteSingleFile()],
	build: {
		outDir: "../../dist/app",
		rollupOptions: {
			input: process.env.INPUT || "src/app/shell-app.html",
		},
	},
});

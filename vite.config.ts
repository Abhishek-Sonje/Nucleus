import { defineConfig } from "vite";
import { resolve } from "path";

// Two separate builds:
// 1. Main build — popup (HTML entry) + background (module SW)
// 2. Content script — must be IIFE format, no imports, self-contained

export default defineConfig(({ mode }) => {
  if (mode === "content") {
    // Content script build — pure IIFE, no module syntax
    return {
      build: {
        outDir: "dist",
        emptyOutDir: false, // don't wipe main build output
        minify: false,
        target: "chrome112",
        lib: {
          entry: resolve(__dirname, "src/content/index.ts"),
          name: "NucleusContent",
          fileName: () => "content.js",
          formats: ["iife"], // IIFE — no import/export, works with executeScript
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
            entryFileNames: "content.js",
          },
        },
      },
      resolve: { alias: { "@": resolve(__dirname, "src") } },
    };
  }

  // Main build — popup + background service worker
  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
      target: "chrome112",
      rollupOptions: {
        input: {
          popup:      resolve(__dirname, "src/popup/index.html"),
          background: resolve(__dirname, "src/background/index.ts"),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === "background") return "background.js";
            return "assets/[name]-[hash].js";
          },
        },
      },
    },
    resolve: { alias: { "@": resolve(__dirname, "src") } },
  };
});

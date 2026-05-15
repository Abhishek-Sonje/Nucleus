import { readFileSync, writeFileSync, cpSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Fix absolute asset paths in popup HTML → relative
const htmlPath = resolve(root, "dist/src/popup/index.html");
let html = readFileSync(htmlPath, "utf8");
html = html.replace(/src="\/assets\//g, 'src="../assets/');
html = html.replace(/href="\/assets\//g, 'href="../assets/');
writeFileSync(htmlPath, html);
console.log("✓ Fixed popup asset paths");

// Copy icons
mkdirSync(resolve(root, "dist/icons"), { recursive: true });
cpSync(resolve(root, "public/icons"), resolve(root, "dist/icons"), { recursive: true });
console.log("✓ Copied icons");

// Copy manifest
cpSync(resolve(root, "manifest.json"), resolve(root, "dist/manifest.json"));
console.log("✓ Copied manifest.json");

console.log("\n✅ dist/ ready — load in chrome://extensions");

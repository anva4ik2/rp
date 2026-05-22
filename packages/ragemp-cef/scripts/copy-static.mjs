import { mkdirSync, cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "..", "src");
const dest = resolve(__dirname, "..", "dist");

if (existsSync(dest)) {
  // overwrite
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[ragemp-cef] copied ${src} -> ${dest}`);

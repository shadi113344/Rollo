/**
 * Generate PNG PWA icons from public/icon.svg
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const svgPath = path.join(publicDir, "icon.svg");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Install sharp first: npm install --save-dev sharp");
  process.exit(1);
}

const svg = fs.readFileSync(svgPath);

async function writePng(name, size, padding = 0) {
  const inner = size - padding * 2;
  const buf = await sharp(svg)
    .resize(inner, inner, { fit: "contain", background: { r: 10, g: 10, b: 10, alpha: 1 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 10, g: 10, b: 10, alpha: 1 },
    })
    .png()
    .toBuffer();
  const out = path.join(publicDir, name);
  fs.writeFileSync(out, buf);
  console.log("wrote", name);
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-512-maskable.png", 512, 64);
await writePng("apple-touch-icon-180.png", 180);

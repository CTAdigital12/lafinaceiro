#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const sourceSvg = path.join(publicDir, "brand", "logo.svg");

const navy = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a — same as background

async function rasterize(size, output, { background = null, padding = 0 } = {}) {
  const inner = size - padding * 2;
  const buffer = await sharp(sourceSvg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  if (padding === 0 && !background) {
    await sharp(buffer).png({ compressionLevel: 9 }).toFile(output);
    return;
  }

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: buffer, top: padding, left: padding }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function main() {
  await fs.mkdir(publicDir, { recursive: true });

  // 1) favicon.svg — modern browsers (vector)
  await fs.copyFile(sourceSvg, path.join(publicDir, "favicon.svg"));
  console.log("✓ favicon.svg");

  // 2) apple-touch-icon — 180x180, opaque (iOS does not respect transparency well)
  await rasterize(180, path.join(publicDir, "apple-touch-icon.png"), { background: navy });
  console.log("✓ apple-touch-icon.png (180×180)");

  // 3) pwa-192x192 — Android PWA + favicon fallback
  await rasterize(192, path.join(publicDir, "pwa-192x192.png"));
  console.log("✓ pwa-192x192.png");

  // 4) pwa-512x512 — Android PWA splash + OG image
  await rasterize(512, path.join(publicDir, "pwa-512x512.png"));
  console.log("✓ pwa-512x512.png");

  // 5) maskable-512x512 — Android adaptive icon, logo inside ~80% safe zone
  // Padding of ~10% on each side keeps the "LA" centered and inside the squircle mask
  await rasterize(512, path.join(publicDir, "maskable-512x512.png"), {
    background: navy,
    padding: 52, // 10.15% padding → ~80% safe zone
  });
  console.log("✓ maskable-512x512.png (with 10% safe-zone padding)");

  // 6) favicon.ico — multi-size 16/32/48 from rasterized PNGs
  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(sourceSvg, { density: 384 })
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    ),
  );
  const icoBuffer = await pngToIco(icoBuffers);
  await fs.writeFile(path.join(publicDir, "favicon.ico"), icoBuffer);
  console.log(`✓ favicon.ico (multi-size: ${icoSizes.join("/")})`);

  console.log("\nAll icons generated successfully.");
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});

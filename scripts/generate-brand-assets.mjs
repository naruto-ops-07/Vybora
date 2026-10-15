#!/usr/bin/env node
// Rasterizes the VYBORA mark (same geometry as apps/web/public/icon.svg) into
// the PNG sizes needed by iOS, Android and the web — no image tooling required.
// Usage: node scripts/generate-brand-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- tiny PNG encoder ------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- signed-distance shapes in the 64×64 design space ----------------------
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
// Flat brand colours (no gradients): deep-teal tile, turquoise mark, light seal.
const TILE = hex('#0F4C47');
const MARK = hex('#2DD4BF');
const SEAL = hex('#E6EEEE');

function sdRoundRect(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax,
    pay = py - ay,
    bax = bx - ax,
    bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/**
 * @param size output px
 * @param opts.background draw the midnight rounded tile
 * @param opts.scale mark scale inside the canvas (adaptive icons need a safe zone)
 */
function render(size, { background = true, scale = 1, square = false } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const px = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // design-space coordinates (centered scaling for the mark)
      const u = (x + 0.5) * px;
      const v = (y + 0.5) * px;
      const mu = 32 + (u - 32) / scale;
      const mv = 32 + (v - 32) / scale;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      const over = (col, alpha) => {
        const na = alpha + a * (1 - alpha);
        if (na <= 0) return;
        r = (col[0] * alpha + r * a * (1 - alpha)) / na;
        g = (col[1] * alpha + g * a * (1 - alpha)) / na;
        b = (col[2] * alpha + b * a * (1 - alpha)) / na;
        a = na;
      };
      const cover = (d, unit) => Math.max(0, Math.min(1, 0.5 - d / unit));
      if (background) over(TILE, square ? 1 : cover(sdRoundRect(u, v, 64, 64, 12), px));
      const stroke =
        Math.min(sdSegment(mu, mv, 18, 20, 32, 45), sdSegment(mu, mv, 32, 45, 46, 20)) - 3;
      over(MARK, cover(stroke, px / scale));
      // 6x6 seal centred at (32, 17)
      over(SEAL, cover(Math.max(Math.abs(mu - 32), Math.abs(mv - 17)) - 3, px / scale));
      const o = (y * size + x) * 4;
      out[o] = Math.round(r);
      out[o + 1] = Math.round(g);
      out[o + 2] = Math.round(b);
      out[o + 3] = Math.round(a * 255);
    }
  }
  return png(size, out);
}

const targets = [
  // iOS requires a square, opaque icon (the OS applies the mask).
  ['apps/mobile/assets/images/icon.png', 1024, { square: true }],
  ['apps/mobile/assets/images/adaptive-foreground.png', 1024, { background: false, scale: 0.62 }],
  ['apps/mobile/assets/images/adaptive-monochrome.png', 1024, { background: false, scale: 0.62 }],
  ['apps/mobile/assets/images/splash-icon.png', 512, {}],
  ['apps/mobile/assets/images/favicon.png', 48, {}],
  ['apps/web/public/icon-192.png', 192, {}],
  ['apps/web/public/icon-512.png', 512, {}],
  ['apps/web/public/apple-touch-icon.png', 180, { square: true }],
];

for (const [rel, size, opts] of targets) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, render(size, opts));
  console.log(`wrote ${rel} (${size}px)`);
}

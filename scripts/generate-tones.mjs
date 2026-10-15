#!/usr/bin/env node
// Synthesizes VYBORA's original message tones (16-bit PCM WAV, 44.1 kHz mono)
// for the mobile bundle and the web app. Usage: node scripts/generate-tones.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 44100;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.85), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Mix notes: [{ f, start, dur, decay, partials?, shape? }] */
function render(totalSec, notes) {
  const out = new Float32Array(Math.ceil(totalSec * RATE));
  for (const n of notes) {
    const start = Math.floor(n.start * RATE);
    const len = Math.floor(n.dur * RATE);
    for (let i = 0; i < len && start + i < out.length; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.006);
      const env = attack * Math.exp(-t * n.decay);
      const f = typeof n.f === 'function' ? n.f(t) : n.f;
      let v = 0;
      for (const [mult, amp] of n.partials ?? [[1, 1]]) {
        const phase = 2 * Math.PI * f * mult * t;
        v += amp * (n.shape === 'square' ? Math.sign(Math.sin(phase)) * 0.35 : Math.sin(phase));
      }
      out[start + i] += v * env * (n.gain ?? 0.5);
    }
  }
  // Short fade-out to avoid clicks.
  const fade = Math.floor(0.01 * RATE);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return [...out];
}

const tones = {
  default: render(0.55, [
    {
      f: 1046.5,
      start: 0,
      dur: 0.3,
      decay: 9,
      partials: [
        [1, 1],
        [2, 0.18],
      ],
    },
    {
      f: 1568,
      start: 0.12,
      dur: 0.42,
      decay: 7,
      partials: [
        [1, 1],
        [2, 0.15],
      ],
    },
  ]),
  soft_chime: render(0.9, [
    {
      f: 1318.5,
      start: 0,
      dur: 0.9,
      decay: 4.5,
      partials: [
        [1, 1],
        [3, 0.12],
      ],
      gain: 0.4,
    },
    {
      f: 1760,
      start: 0.09,
      dur: 0.8,
      decay: 5,
      partials: [
        [1, 1],
        [3, 0.1],
      ],
      gain: 0.32,
    },
  ]),
  pop: render(0.16, [{ f: (t) => 950 - t * 4200, start: 0, dur: 0.16, decay: 26, gain: 0.7 }]),
  bell: render(1.3, [
    {
      f: 880,
      start: 0,
      dur: 1.3,
      decay: 3.2,
      partials: [
        [1, 1],
        [2.76, 0.42],
        [5.4, 0.2],
        [8.93, 0.08],
      ],
      gain: 0.38,
    },
  ]),
  electronic: render(0.42, [
    { f: 1244.5, start: 0, dur: 0.11, decay: 6, shape: 'square', gain: 0.45 },
    { f: 1661.2, start: 0.14, dur: 0.11, decay: 6, shape: 'square', gain: 0.45 },
    { f: 2093, start: 0.28, dur: 0.13, decay: 9, shape: 'square', gain: 0.4 },
  ]),
};

for (const dir of ['apps/mobile/assets/tones', 'apps/web/public/tones']) {
  mkdirSync(join(root, dir), { recursive: true });
  for (const [name, samples] of Object.entries(tones)) {
    writeFileSync(join(root, dir, `${name}.wav`), wav(samples));
  }
}
console.log(
  `wrote ${Object.keys(tones).length} tones to apps/mobile/assets/tones and apps/web/public/tones`,
);

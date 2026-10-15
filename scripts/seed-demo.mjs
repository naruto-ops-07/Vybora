#!/usr/bin/env node
// Seeds clearly-labelled DEMO data into a LOCAL or development Supabase project
// through the real APIs (Auth admin, Storage, create_post RPC) — no SQL shortcuts,
// so every trigger, policy and counter runs exactly as in production.
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
//     node scripts/seed-demo.mjs
//
// Refuses to run against non-local URLs unless --allow-remote is passed.
// Demo accounts use the @demo.vybora.dev domain and the password printed below.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error(
    'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (see `supabase status`).',
  );
  process.exit(1);
}
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!isLocal && !process.argv.includes('--allow-remote')) {
  console.error(
    `Refusing to seed non-local project ${url}. Pass --allow-remote for a dev/staging project. Never seed production.`,
  );
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD ?? 'vybora-demo-123';
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---- tiny PNG generator (soft gradients so posts look intentional) ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (t, d) => {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
};
function gradientPng(w, h, from, to) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      const i = y * (w * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[i + k] = Math.round(from[k] + (to[k] - from[k]) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PALETTES = [
  [
    [109, 90, 232],
    [184, 169, 255],
  ],
  [
    [255, 92, 122],
    [255, 177, 153],
  ],
  [
    [34, 195, 166],
    [184, 242, 230],
  ],
  [
    [17, 17, 22],
    [109, 90, 232],
  ],
  [
    [245, 165, 36],
    [255, 92, 122],
  ],
];

const people = [
  { username: 'demo.lena', display: 'Lena Ortiz', bio: 'Film photographer. Light chaser.' },
  { username: 'demo.kai', display: 'Kai Nakamura', bio: 'Street & architecture · Tokyo' },
  { username: 'demo.amara', display: 'Amara Okafor', bio: 'Food stories from my kitchen' },
  { username: 'demo.jonas', display: 'Jonas Berg', bio: 'Trails, coffee, repeat.', private: true },
];

async function ensureUser(p) {
  const email = `${p.username.replace('.', '_')}@demo.vybora.dev`;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: p.username, display_name: p.display },
    });
    if (error) throw error;
    user = data.user;
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  await client.from('profiles').update({ bio: p.bio, is_private: !!p.private }).eq('id', user.id);
  return { ...p, id: user.id, email, client };
}

async function post(u, caption, n = 1) {
  const media = [];
  for (let i = 0; i < n; i++) {
    const [from, to] = PALETTES[(caption.length + i) % PALETTES.length];
    const path = `${u.id}/${randomUUID()}.png`;
    const { error } = await u.client.storage
      .from('media')
      .upload(path, gradientPng(540, 675, from, to), { contentType: 'image/png' });
    if (error) throw error;
    media.push({
      storage_path: path,
      media_type: 'image',
      mime_type: 'image/png',
      width: 540,
      height: 675,
      alt_text: 'Abstract gradient (demo image)',
    });
  }
  const { data, error } = await u.client.rpc('create_post', {
    p_caption: caption,
    p_media: media,
    p_kind: 'post',
    p_comments_enabled: true,
  });
  if (error) throw error;
  return data;
}

const users = [];
for (const p of people) users.push(await ensureUser(p));
const [lena, kai, amara, jonas] = users;

const follows = [
  [kai, lena],
  [amara, lena],
  [lena, kai],
  [amara, kai],
  [lena, amara],
  [jonas, lena],
  [lena, jonas],
];
for (const [a, b] of follows)
  await a.client.from('follows').insert({ follower_id: a.id, following_id: b.id });
// Jonas is private: approve Lena's request.
await jonas.client
  .from('follows')
  .update({ status: 'accepted' })
  .eq('follower_id', lena.id)
  .eq('following_id', jonas.id);

const p1 = await post(lena, 'Golden hour on the coast [demo] #sunset #film', 3);
const p2 = await post(kai, 'Lines and light [demo] #architecture @demo.lena');
const p3 = await post(amara, 'Sunday bread [demo] #baking');
await post(jonas, 'Morning trail [demo] #outdoors');

await kai.client.from('likes').insert({ user_id: kai.id, post_id: p1 });
await amara.client.from('likes').insert({ user_id: amara.id, post_id: p1 });
await lena.client.from('likes').insert({ user_id: lena.id, post_id: p2 });
await amara.client
  .from('comments')
  .insert({ post_id: p1, author_id: amara.id, body: 'These colors! [demo]' });
await lena.client
  .from('comments')
  .insert({ post_id: p3, author_id: lena.id, body: 'Recipe please [demo]' });

const storyPath = `${kai.id}/${randomUUID()}.png`;
await kai.client.storage
  .from('media')
  .upload(storyPath, gradientPng(540, 960, [17, 17, 22], [109, 90, 232]), {
    contentType: 'image/png',
  });
await kai.client.from('stories').insert({
  author_id: kai.id,
  storage_path: storyPath,
  media_type: 'image',
  mime_type: 'image/png',
});

const { data: conv } = await lena.client.rpc('start_direct_conversation', { p_other: kai.id });
await lena.client
  .from('messages')
  .insert({ conversation_id: conv, sender_id: lena.id, body: 'Loved your latest shot! [demo]' });

console.log('\nDemo data ready (local/dev only). Sign in with any of:');
for (const u of users) console.log(`  ${u.email}  /  ${PASSWORD}`);
console.log('\nTo make one an admin, run in the SQL editor (never from a client):');
console.log(`  insert into public.user_roles (user_id, role) values ('${lena.id}', 'admin');`);

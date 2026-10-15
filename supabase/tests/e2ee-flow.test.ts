import { randomBytes } from 'node:crypto';
import { ConnectEngine, MemoryStore, type LocalMessage } from '@vybora/e2ee';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './harness/db';
import { PgTransport } from './harness/pgTransport';

/**
 * End-to-end: real MLS engines on separate "devices" talking through the
 * real migrated database under RLS. Proves the server only ever holds
 * ciphertext and that membership/device changes behave correctly.
 */
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

type User = { id: string; username: string };
interface Device {
  user: User;
  engine: ConnectEngine;
  transport: PgTransport;
  store: MemoryStore;
}

async function device(user: User, platform: 'ios' | 'android' | 'web' = 'ios'): Promise<Device> {
  const transport = new PgTransport(db, user);
  const store = new MemoryStore();
  const engine = new ConnectEngine(transport, store, {
    userId: user.id,
    platform,
    label: `${user.username}-${platform}`,
  });
  await engine.init();
  return { user, engine, transport, store };
}

async function newChat(owner: User, kind: 'direct' | 'group', members: User[], title?: string) {
  const [r] = await db.as<{ id: string }>(
    owner,
    `select public.create_secure_conversation($1, $2::uuid[], $3) as id`,
    [kind, members.map((m) => m.id), title ?? null],
  );
  return r!.id;
}

const texts = (ms: LocalMessage[]) => ms.filter((m) => m.kind === 'text').map((m) => m.body);
async function read(d: Device, conv: string) {
  await d.engine.sync(conv);
  return d.engine.listMessages(conv);
}

describe('encrypted direct messages', () => {
  it('delivers both ways and stores only ciphertext on the server', async () => {
    const alice = await device(await db.createUser('e2e_alice'), 'web');
    const bob = await device(await db.createUser('e2e_bob'), 'android');
    const conv = await newChat(alice.user, 'direct', [bob.user]);

    const sent = await alice.engine.send(conv, {
      t: 'text',
      body: 'Top secret: the launch is Friday',
    });
    expect(sent).toMatchObject({ status: 'sent' });
    expect(texts(await read(bob, conv))).toEqual(['Top secret: the launch is Friday']);

    await bob.engine.send(conv, {
      t: 'text',
      body: 'Got it 🚀',
      replyTo: { id: sent!.id, senderId: alice.user.id, preview: 'Top secret…' },
    });
    const aliceView = await read(alice, conv);
    expect(texts(aliceView)).toEqual(['Top secret: the launch is Friday', 'Got it 🚀']);
    expect(aliceView[1]!.replyTo?.id).toBe(sent!.id);

    // Nothing readable at rest on the server.
    const rows = await db.admin<{ ciphertext: string }>(
      `select ciphertext from mls_envelopes where conversation_id = $1`,
      [conv],
    );
    const dump = rows
      .map((r) => r.ciphertext + Buffer.from(r.ciphertext, 'base64').toString('latin1'))
      .join('|');
    for (const secret of ['launch', 'Friday', 'Got it']) expect(dump).not.toContain(secret);
    const welcomes = await db.admin<{ welcome: string }>(`select welcome from mls_welcomes`);
    expect(
      welcomes.map((w) => Buffer.from(w.welcome, 'base64').toString('latin1')).join(''),
    ).not.toContain('launch');
    const notes = await db.admin<{ body: string | null }>(
      `select body from notifications where conversation_id = $1`,
      [conv],
    );
    expect(notes.every((n) => n.body === null)).toBe(true);
  });

  it('keeps third parties out even with the conversation id', async () => {
    const a = await device(await db.createUser('e2e_tp_a'));
    const b = await device(await db.createUser('e2e_tp_b'));
    const eve = await device(await db.createUser('e2e_tp_eve'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    await a.engine.send(conv, { t: 'text', body: 'private' });
    expect(await eve.engine.sync(conv).catch((e: { code: string }) => e.code)).toBe('forbidden');
    expect(await eve.transport.fetchEnvelopes(conv, 0, 100)).toEqual([]);
  });

  it('survives both sides creating the session at the same moment', async () => {
    const a = await device(await db.createUser('e2e_race_a'));
    const b = await device(await db.createUser('e2e_race_b'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    await Promise.all([
      a.engine.send(conv, { t: 'text', body: 'hi from a' }),
      b.engine.send(conv, { t: 'text', body: 'hi from b' }),
    ]);
    expect(texts(await read(a, conv)).sort()).toEqual(['hi from a', 'hi from b']);
    expect(texts(await read(b, conv)).sort()).toEqual(['hi from a', 'hi from b']);
  });

  it('retries a send whose response was lost without duplicating it', async () => {
    const a = await device(await db.createUser('e2e_retry_a'));
    const b = await device(await db.createUser('e2e_retry_b'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    await a.engine.send(conv, { t: 'text', body: 'warm up' });
    a.transport.dropNextPostResponse = true;
    await expect(a.engine.send(conv, { t: 'text', body: 'flaky network' })).rejects.toMatchObject({
      code: 'network',
    });
    const failed = (await a.engine.listMessages(conv)).find((m) => m.body === 'flaky network')!;
    expect(failed.status).toBe('failed');
    const retried = await a.engine.retry(conv, failed.id);
    expect(retried).toMatchObject({ status: 'sent' });
    const [{ n }] = (await db.admin<{ n: number }>(
      `select count(*)::int as n from mls_envelopes where client_id = $1`,
      [failed.id],
    )) as [{ n: number }];
    expect(n).toBe(1);
    expect(texts(await read(b, conv))).toEqual(['warm up', 'flaky network']);
  });

  it('shows a placeholder (not garbage) if the server tampers with a message', async () => {
    const a = await device(await db.createUser('e2e_tamper_a'));
    const b = await device(await db.createUser('e2e_tamper_b'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    const m = await a.engine.send(conv, { t: 'text', body: 'original' });
    const [row] = await db.admin<{ ciphertext: string }>(
      `select ciphertext from mls_envelopes where seq = $1`,
      [m!.seq],
    );
    const bytes = Buffer.from(row!.ciphertext, 'base64');
    bytes[bytes.length - 4]! ^= 0xff;
    await db.admin(`update mls_envelopes set ciphertext = $1 where seq = $2`, [
      bytes.toString('base64'),
      m!.seq,
    ]);
    const view = await read(b, conv);
    expect(view.map((x) => x.status)).toEqual(['undecryptable']);
    await a.engine.send(conv, { t: 'text', body: 'still works' });
    expect(texts(await read(b, conv))).toEqual(['still works']);
  });

  it('supports reactions and delete-for-everyone (sender only)', async () => {
    const a = await device(await db.createUser('e2e_react_a'));
    const b = await device(await db.createUser('e2e_react_b'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    const m = await a.engine.send(conv, { t: 'text', body: 'react to me' });
    await read(b, conv);
    await b.engine.send(conv, { t: 'reaction', target: m!.id, emoji: '❤️' });
    expect((await read(a, conv))[0]!.reactions).toEqual({ '❤️': [b.user.id] });
    await b.engine.send(conv, { t: 'delete', target: m!.id }); // not the sender → ignored
    expect((await read(a, conv))[0]!.deleted).toBeFalsy();
    await a.engine.send(conv, { t: 'delete', target: m!.id });
    const deleted = (await read(b, conv))[0]!;
    expect(deleted.deleted).toBe(true);
    expect(deleted.body).toBeUndefined();
  });

  it('encrypts attachments end to end', async () => {
    const a = await device(await db.createUser('e2e_att_a'));
    const b = await device(await db.createUser('e2e_att_b'));
    const conv = await newChat(a.user, 'direct', [b.user]);
    const photo = randomBytes(20_000);
    await a.engine.sendAttachment(
      conv,
      photo,
      { kind: 'image', mime: 'image/jpeg', width: 800, height: 600 },
      { caption: 'sunset' },
    );
    const [msg] = await read(b, conv);
    expect(msg).toMatchObject({ kind: 'attachment', caption: 'sunset' });
    expect(Buffer.from(await b.engine.openAttachment(msg!.attachment!))).toEqual(photo);
    const [env] = await db.admin<{ attachment_paths: string[] }>(
      `select attachment_paths from mls_envelopes where kind = 'application' and conversation_id = $1`,
      [conv],
    );
    expect(env!.attachment_paths).toEqual([msg!.attachment!.path]); // opaque path only — no key on the server
  });
});

describe('devices and groups', () => {
  it('adds a new device of a member automatically; it reads only messages after joining', async () => {
    const alice = await device(await db.createUser('e2e_md_alice'));
    const bobUser = await db.createUser('e2e_md_bob');
    const bobPhone = await device(bobUser, 'ios');
    const conv = await newChat(alice.user, 'direct', [bobUser]);
    await alice.engine.send(conv, { t: 'text', body: 'before laptop' });
    await read(bobPhone, conv);

    const bobLaptop = await device(bobUser, 'web');
    expect((await bobLaptop.engine.sync(conv)).status).toBe('waiting_for_access');
    await alice.engine.send(conv, { t: 'text', body: 'after laptop' }); // alice's sync adds the laptop first
    expect(texts(await read(bobLaptop, conv))).toEqual(['after laptop']);
    expect(texts(await read(bobPhone, conv))).toEqual(['before laptop', 'after laptop']);

    // Key change is detected for contacts who pinned bob's keys earlier.
    const status = await alice.engine.checkContactKeys(bobUser.id);
    expect(['new', 'changed']).toContain(status.status);
    expect(await alice.engine.safetyNumberWith(bobUser.id)).toBe(
      await bobPhone.engine.safetyNumberWith(alice.user.id),
    );
  });

  it('removes a revoked device from the group so it cannot decrypt new messages', async () => {
    const alice = await device(await db.createUser('e2e_rv_alice'));
    const bobUser = await db.createUser('e2e_rv_bob');
    const bobPhone = await device(bobUser);
    const bobOld = await device(bobUser, 'android');
    const conv = await newChat(alice.user, 'direct', [bobUser]);
    await alice.engine.send(conv, { t: 'text', body: 'hello both' });
    expect(texts(await read(bobOld, conv))).toEqual(['hello both']);

    await bobPhone.engine.revokeDevice(bobOld.engine.deviceId);
    await alice.engine.send(conv, { t: 'text', body: 'only the phone' });
    const old = await read(bobOld, conv).catch(() => [] as LocalMessage[]);
    expect(texts(old)).not.toContain('only the phone');
    expect(texts(await read(bobPhone, conv))).toEqual(['hello both', 'only the phone']);

    // The revoked device wipes itself on next start.
    const restarted = new ConnectEngine(bobOld.transport, bobOld.store, {
      userId: bobUser.id,
      platform: 'android',
      label: 'old',
    });
    const r = await restarted.init();
    expect(r.created).toBe(true);
    expect(await restarted.listMessages(conv)).toEqual([]);
  });

  it('runs an encrypted group and cuts off removed members', async () => {
    const [admin, m1, m2] = [
      await device(await db.createUser('e2e_g_admin')),
      await device(await db.createUser('e2e_g_m1')),
      await device(await db.createUser('e2e_g_m2')),
    ];
    const conv = await newChat(admin.user, 'group', [m1.user, m2.user], 'Launch crew');
    await admin.engine.send(conv, { t: 'text', body: 'welcome all' });
    expect(texts(await read(m1, conv))).toEqual(['welcome all']);
    expect(texts(await read(m2, conv))).toEqual(['welcome all']);
    await m1.engine.send(conv, { t: 'text', body: 'hi team' });
    expect(texts(await read(m2, conv))).toEqual(['welcome all', 'hi team']);

    await db.as(admin.user, `select public.remove_group_member($1, $2)`, [conv, m2.user.id]);
    await admin.engine.send(conv, { t: 'text', body: 'm2 is gone' });
    expect(texts(await read(m1, conv))).toContain('m2 is gone');
    await expect(m2.engine.sync(conv)).rejects.toMatchObject({ code: 'forbidden' });
    expect(texts(await m2.engine.listMessages(conv))).not.toContain('m2 is gone');
  });

  it('keeps the local history encrypted at rest', async () => {
    const inner = new MemoryStore();
    const { EncryptedStore } = await import('@vybora/e2ee');
    const user = await db.createUser('e2e_rest');
    const peer = await device(await db.createUser('e2e_rest_peer'));
    const engine = new ConnectEngine(
      new PgTransport(db, user),
      new EncryptedStore(inner, randomBytes(32)),
      {
        userId: user.id,
        platform: 'ios',
        label: 'enc',
      },
    );
    await engine.init();
    const conv = await newChat(user, 'direct', [peer.user]);
    await engine.send(conv, { t: 'text', body: 'diary entry' });
    for (const raw of inner.rawValues())
      expect(Buffer.from(raw).toString('latin1')).not.toContain('diary');
    expect(texts(await engine.listMessages(conv))).toEqual(['diary entry']);
  });
});

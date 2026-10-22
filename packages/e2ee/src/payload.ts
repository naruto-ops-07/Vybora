import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';
import { b64, utf8 } from './codec';

/** Message content — exists in plaintext only on sender/recipient devices. */
const id = z.string().uuid();
const replyTo = z
  .object({ id, senderId: z.string().uuid(), preview: z.string().max(140) })
  .optional();

export const attachmentSchema = z.object({
  kind: z.enum(['image', 'video', 'file', 'voice']),
  path: z.string().max(300),
  key: z.string().max(100), // base64 32-byte content key
  nonce: z.string().max(100), // base64 24-byte nonce
  sha256: z.string().max(100), // base64 digest of ciphertext
  mime: z.string().max(100),
  size: z.number().int().nonnegative().max(26_214_400),
  name: z.string().max(200).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  durationMs: z.number().int().nonnegative().max(600_000).optional(),
  /** Recipient devices drop the key and blob reference after one open. */
  viewOnce: z.literal(true).optional(),
});

/** Mentioned member user ids (rendered from `@[userId]` tokens in the body). */
const mentions = z.array(z.string().uuid()).max(50).optional();
const forwarded = z.literal(true).optional();
const finite = z.number().finite();
const pollOptions = z
  .array(z.string().trim().min(1).max(100))
  .min(2)
  .max(12)
  .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, 'duplicate_options');

export const payloadSchema = z.discriminatedUnion('t', [
  z.object({
    v: z.literal(1),
    t: z.literal('text'),
    id,
    body: z.string().min(1).max(4000),
    replyTo,
    mentions,
    forwarded,
  }),
  z.object({
    v: z.literal(1),
    t: z.literal('attachment'),
    id,
    attachment: attachmentSchema,
    caption: z.string().max(2000).optional(),
    replyTo,
    forwarded,
  }),
  z.object({
    v: z.literal(1),
    t: z.literal('reaction'),
    id,
    target: id,
    emoji: z.string().min(1).max(16),
    remove: z.boolean().optional(),
  }),
  z.object({ v: z.literal(1), t: z.literal('delete'), id, target: id }),
  /** Replace the body (text) or caption (attachment) of the sender's own message. */
  z.object({
    v: z.literal(1),
    t: z.literal('edit'),
    id,
    target: id,
    body: z.string().min(1).max(4000),
    mentions,
  }),
  z.object({ v: z.literal(1), t: z.literal('pin'), id, target: id, pinned: z.boolean() }),
  z.object({
    v: z.literal(1),
    t: z.literal('contact'),
    id,
    userId: z.string().uuid(),
    username: z.string().min(1).max(40),
    displayName: z.string().max(100),
    forwarded,
  }),
  z.object({
    v: z.literal(1),
    t: z.literal('location'),
    id,
    lat: finite.min(-90).max(90),
    lng: finite.min(-180).max(180),
    label: z.string().max(200).optional(),
    forwarded,
  }),
  z.object({
    v: z.literal(1),
    t: z.literal('poll'),
    id,
    question: z.string().trim().min(1).max(300),
    options: pollOptions,
    multi: z.boolean(),
  }),
  /** The voter's full current choice set (empty = vote withdrawn). Latest wins. */
  z.object({
    v: z.literal(1),
    t: z.literal('vote'),
    id,
    target: id,
    choices: z.array(z.number().int().min(0).max(11)).max(12),
  }),
]);

export type Payload = z.infer<typeof payloadSchema>;
export type AttachmentRef = z.infer<typeof attachmentSchema>;

interface SignedEnvelope {
  d: string; // sender device id
  s: string; // base64 Ed25519 signature
  p: Payload;
}

function signingInput(
  conversationId: string,
  deviceId: string,
  payload: { id: string },
): Uint8Array {
  const digest = sha256(utf8.encode(JSON.stringify(payload)));
  return utf8.encode(
    `vybora-msg-v1|${conversationId}|${deviceId}|${payload.id}|${b64.encode(digest)}`,
  );
}

const ED25519_PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * MLS signature keys are PKCS#8 (48 bytes) when produced via WebCrypto and a
 * raw 32-byte seed otherwise. Normalize strictly to the seed.
 */
export function ed25519Seed(signKey: Uint8Array): Uint8Array {
  if (signKey.length === 32) return signKey;
  if (signKey.length === 48 && ED25519_PKCS8_PREFIX.every((b, i) => signKey[i] === b))
    return signKey.subarray(16);
  throw new Error('unsupported_signing_key_format');
}

/** Sign then serialize. The result is what gets MLS-encrypted. */
export function sealPayload(
  conversationId: string,
  deviceId: string,
  signKey: Uint8Array,
  payload: Payload,
): Uint8Array {
  const valid = payloadSchema.parse(payload);
  const sig = ed25519.sign(signingInput(conversationId, deviceId, valid), ed25519Seed(signKey));
  const env: SignedEnvelope = { d: deviceId, s: b64.encode(sig), p: valid };
  return utf8.encode(JSON.stringify(env));
}

/**
 * Forward-compatibility contract (every build follows it, `v` stays 1):
 *
 *  - The Ed25519 signature covers the exact payload object the sender sent,
 *    and is verified BEFORE schema parsing. Unknown kinds and unknown fields
 *    therefore still verify (and forged ones still fail).
 *  - An unknown `t` is shown as an "Update VYBORA to see this message"
 *    placeholder (`UnsupportedPayload`), unless the payload carries
 *    `silent: true`: then it is dropped without a trace (for future control
 *    kinds such as read-state or settings that have nothing to show).
 *  - Unknown fields on a known kind are ignored (stripped) by default. A
 *    newer client that adds a field older builds MUST NOT ignore (for
 *    example a privacy-relevant `expiresInSec`) lists it in `crit: string[]`
 *    (dotted paths reach into objects, e.g. `attachment.expiresInSec`). If
 *    this build doesn't know any listed field, the whole message becomes an
 *    `UnsupportedPayload` (or is dropped when `silent`), never a stripped copy.
 *  - `crit` and `silent` are head fields: they sit next to `v`, `t` and `id`.
 */

/**
 * A payload kind this build doesn't know (sent by a newer client), or a known
 * kind with a critical field this build doesn't understand. Its signature has
 * still been verified; it is shown as "update to see this". Never sealed or sent.
 */
export interface UnsupportedPayload {
  v: 1;
  t: 'unsupported';
  id: string;
  /** The `t` as received (for diagnostics only; never displayed). */
  kind: string;
}

/** A verified payload a newer client marked `silent` that this build can't use: drop it. */
export interface IgnoredPayload {
  v: 1;
  t: 'ignored';
  id: string;
  kind: string;
}

export type OpenedPayload = Payload | UnsupportedPayload | IgnoredPayload;

type Variant = (typeof payloadSchema.options)[number];
const VARIANTS = new Map<string, Variant>(payloadSchema.options.map((o) => [o.shape.t.value, o]));
const HEAD_FIELDS = new Set(['v', 't', 'id', 'crit', 'silent']);
const envelopeHead = z.object({
  v: z.literal(1),
  t: z.string().min(1).max(40),
  id,
  crit: z.array(z.string().min(1).max(80)).max(20).optional(),
  silent: z.literal(true).optional(),
});

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Does this build's schema for the kind know the (dotted) field path? Own keys only. */
function knowsField(variant: Variant, path: string): boolean {
  const [first, ...rest] = path.split('.');
  if (!rest.length && HEAD_FIELDS.has(first!)) return true;
  const shape = variant.shape as Record<string, z.ZodTypeAny>;
  if (!own(shape, first!)) return false;
  let node: z.ZodTypeAny = shape[first!]!;
  for (const part of rest) {
    while (node instanceof z.ZodOptional || node instanceof z.ZodNullable) node = node.unwrap();
    if (!(node instanceof z.ZodObject)) return false;
    const inner = node.shape as Record<string, z.ZodTypeAny>;
    if (!own(inner, part)) return false;
    node = inner[part]!;
  }
  return true;
}

/**
 * Validate and verify a decrypted payload. `resolveKey` returns the
 * registered identity key for a device id (from the device directory).
 * See the forward-compatibility contract above. Throws if the envelope or a
 * known kind is malformed or the signature doesn't verify.
 */
export async function openPayload(
  conversationId: string,
  plaintext: Uint8Array,
  expectedDeviceId: string | null,
  resolveKey: (deviceId: string) => Promise<Uint8Array | null>,
): Promise<{ deviceId: string; payload: OpenedPayload }> {
  const raw = JSON.parse(utf8.decode(plaintext)) as Partial<SignedEnvelope>;
  if (typeof raw.d !== 'string' || typeof raw.s !== 'string') throw new Error('malformed_payload');
  // The signer must be the envelope's sender device, checked BEFORE any
  // directory lookup so crafted ids never reach the server.
  if (!expectedDeviceId || raw.d !== expectedDeviceId || !UUID_RE.test(raw.d))
    throw new Error('sender_mismatch');
  if (!raw.p || typeof raw.p !== 'object' || Array.isArray(raw.p))
    throw new Error('malformed_payload');
  const head = envelopeHead.parse(raw.p);
  const key = await resolveKey(raw.d);
  if (!key) throw new Error('unknown_sender_device');
  const ok = ed25519.verify(b64.decode(raw.s), signingInput(conversationId, raw.d, raw.p), key);
  if (!ok) throw new Error('bad_sender_signature');
  const variant = VARIANTS.get(head.t);
  const understood = !!variant && (head.crit ?? []).every((f) => knowsField(variant, f));
  if (!understood) {
    const t = head.silent ? ('ignored' as const) : ('unsupported' as const);
    return { deviceId: raw.d, payload: { v: 1, t, id: head.id, kind: head.t } };
  }
  return { deviceId: raw.d, payload: payloadSchema.parse(raw.p) };
}

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
});

export const payloadSchema = z.discriminatedUnion('t', [
  z.object({
    v: z.literal(1),
    t: z.literal('text'),
    id,
    body: z.string().min(1).max(4000),
    replyTo,
  }),
  z.object({
    v: z.literal(1),
    t: z.literal('attachment'),
    id,
    attachment: attachmentSchema,
    caption: z.string().max(2000).optional(),
    replyTo,
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
 * A payload kind this build doesn't know (sent by a newer client). Its
 * signature has still been verified; it is shown as "update to see this".
 * Never sealed or sent.
 */
export interface UnsupportedPayload {
  v: 1;
  t: 'unsupported';
  id: string;
  /** The unknown `t` as received (for diagnostics only; never displayed). */
  kind: string;
}

export type OpenedPayload = Payload | UnsupportedPayload;

const KNOWN_KINDS: ReadonlySet<string> = new Set(payloadSchema.options.map((o) => o.shape.t.value));
const envelopeHead = z.object({ v: z.literal(1), t: z.string().min(1).max(40), id });

/**
 * Validate and verify a decrypted payload. `resolveKey` returns the
 * registered identity key for a device id (from the device directory).
 * The signature is checked over the exact payload object the sender signed,
 * before any schema parsing, so unknown kinds (and unknown future fields)
 * still verify. Throws if the envelope or a known kind is malformed or the
 * signature doesn't verify.
 */
export async function openPayload(
  conversationId: string,
  plaintext: Uint8Array,
  resolveKey: (deviceId: string) => Promise<Uint8Array | null>,
): Promise<{ deviceId: string; payload: OpenedPayload }> {
  const raw = JSON.parse(utf8.decode(plaintext)) as Partial<SignedEnvelope>;
  if (typeof raw.d !== 'string' || typeof raw.s !== 'string') throw new Error('malformed_payload');
  if (!raw.p || typeof raw.p !== 'object' || Array.isArray(raw.p))
    throw new Error('malformed_payload');
  const head = envelopeHead.parse(raw.p);
  const key = await resolveKey(raw.d);
  if (!key) throw new Error('unknown_sender_device');
  const ok = ed25519.verify(b64.decode(raw.s), signingInput(conversationId, raw.d, raw.p), key);
  if (!ok) throw new Error('bad_sender_signature');
  if (!KNOWN_KINDS.has(head.t))
    return { deviceId: raw.d, payload: { v: 1, t: 'unsupported', id: head.id, kind: head.t } };
  return { deviceId: raw.d, payload: payloadSchema.parse(raw.p) };
}

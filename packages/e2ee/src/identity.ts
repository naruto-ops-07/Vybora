import { sha256 } from '@noble/hashes/sha2.js';
import {
  defaultCapabilities,
  defaultLifetime,
  generateKeyPackageWithKey,
  type Credential,
  type KeyPackage,
  type PrivateKeyPackage,
} from 'ts-mls';
import { makeKeyPackageRef } from 'ts-mls/keyPackage.js';
import { b64, toHex, utf8 } from './codec';
import { getSuite } from './suite';

/** A device's long-term identity: an Ed25519 signing key pair bound to user + device ids. */
export interface DeviceIdentity {
  userId: string;
  deviceId: string;
  signKey: Uint8Array; // private — never leaves the device
  publicKey: Uint8Array; // published as devices.identity_key
}

export interface StoredIdentity {
  userId: string;
  deviceId: string;
  signKey: string;
  publicKey: string;
}

export const serializeIdentity = (i: DeviceIdentity): StoredIdentity => ({
  userId: i.userId,
  deviceId: i.deviceId,
  signKey: b64.encode(i.signKey),
  publicKey: b64.encode(i.publicKey),
});
export const deserializeIdentity = (s: StoredIdentity): DeviceIdentity => ({
  userId: s.userId,
  deviceId: s.deviceId,
  signKey: b64.decode(s.signKey),
  publicKey: b64.decode(s.publicKey),
});

/** Generate a fresh Ed25519 identity. `deviceId` is assigned by the server at registration. */
export async function generateIdentityKeys(): Promise<{
  signKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const cs = await getSuite();
  return cs.signature.keygen();
}

/** MLS basic credential: identity bytes carry the user and device ids. */
export function credentialFor(userId: string, deviceId: string): Credential {
  return {
    credentialType: 'basic',
    identity: utf8.encode(JSON.stringify({ u: userId, d: deviceId })),
  };
}

export function parseCredential(c: Credential): { userId: string; deviceId: string } | null {
  if (c.credentialType !== 'basic') return null;
  try {
    const v = JSON.parse(utf8.decode(c.identity)) as { u?: unknown; d?: unknown };
    return typeof v.u === 'string' && typeof v.d === 'string'
      ? { userId: v.u, deviceId: v.d }
      : null;
  } catch {
    return null;
  }
}

export interface GeneratedKeyPackage {
  /** Hex KeyPackageRef — how a Welcome identifies the package it targets. */
  ref: string;
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}

/** One-time key packages (the MLS equivalent of Signal's one-time prekeys). */
export async function generateKeyPackages(
  identity: DeviceIdentity,
  count: number,
): Promise<GeneratedKeyPackage[]> {
  const cs = await getSuite();
  const out: GeneratedKeyPackage[] = [];
  for (let i = 0; i < count; i++) {
    const { publicPackage, privatePackage } = await generateKeyPackageWithKey(
      credentialFor(identity.userId, identity.deviceId),
      defaultCapabilities(),
      defaultLifetime,
      [],
      { signKey: identity.signKey, publicKey: identity.publicKey },
      cs,
    );
    out.push({
      ref: toHex(await makeKeyPackageRef(publicPackage, cs.hash)),
      publicPackage,
      privatePackage,
    });
  }
  return out;
}

/**
 * Safety number for verifying a contact out of band. Derived only from both
 * users' public identity keys (all devices, sorted), so both sides compute the
 * same 60 digits. Changes whenever either side's device keys change.
 */
export function safetyNumber(
  a: { userId: string; keys: string[] },
  b: { userId: string; keys: string[] },
): string {
  const side = (s: { userId: string; keys: string[] }) =>
    `${s.userId}:${[...s.keys].sort().join(',')}`;
  const [first, second] = [side(a), side(b)].sort();
  let digest = sha256(utf8.encode(`vybora-safety-v1|${first}|${second}`));
  // 12 groups × 5 digits, using iterated hashing for enough bytes.
  const digits: string[] = [];
  while (digits.length < 12) {
    for (let i = 0; i + 5 <= digest.length && digits.length < 12; i += 5) {
      const n = (
        (digest[i]! * 2 ** 32 +
          digest[i + 1]! * 2 ** 24 +
          digest[i + 2]! * 2 ** 16 +
          digest[i + 3]! * 2 ** 8 +
          digest[i + 4]!) %
        100000
      )
        .toString()
        .padStart(5, '0');
      digits.push(n);
    }
    digest = sha256(digest);
  }
  return digits.join(' ');
}

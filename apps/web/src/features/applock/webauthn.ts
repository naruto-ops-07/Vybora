/**
 * “Unlock with fingerprint, face or Windows Hello”: a WebAuthn platform credential, checked
 * entirely in this browser. We keep its id and public key and verify each assertion’s
 * signature locally; there is no server round trip and nothing is uploaded.
 */
import { bytesEqual } from '@vybora/core';
import { fromB64, toB64, type StoredBiometric } from './store';

const ES256 = -7;
const RS256 = -257;

/** True when this browser has a platform authenticator that can verify the person. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function registerBiometric(user: {
  id: string;
  name: string;
}): Promise<StoredBiometric> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'VYBORA' },
      user: {
        id: new TextEncoder().encode(user.id),
        name: user.name,
        displayName: user.name,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: ES256 },
        { type: 'public-key', alg: RS256 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No credential was created.');
  const response = cred.response as AuthenticatorAttestationResponse;
  const spki = response.getPublicKey();
  const alg = response.getPublicKeyAlgorithm();
  if (!spki || (alg !== ES256 && alg !== RS256)) throw new Error('Unsupported authenticator.');
  return { id: toB64(cred.rawId), publicKey: toB64(spki), alg };
}

/** ECDSA signatures arrive DER-encoded; WebCrypto wants r‖s, 32 bytes each. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('Bad signature');
  let at = 2;
  const part = () => {
    if (der[at] !== 0x02) throw new Error('Bad signature');
    const len = der[at + 1]!;
    let n = der.slice(at + 2, at + 2 + len);
    at += 2 + len;
    while (n.length > 32 && n[0] === 0) n = n.slice(1);
    const out = new Uint8Array(32);
    out.set(n, 32 - n.length);
    return out;
  };
  const r = part();
  const s = part();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data));

const buf = (b: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> =>
  b instanceof Uint8Array ? new Uint8Array(b) : new Uint8Array(b);

export interface Assertion {
  authenticatorData: ArrayBuffer | Uint8Array;
  clientDataJSON: ArrayBuffer | Uint8Array;
  signature: ArrayBuffer | Uint8Array;
}

/**
 * Checks an assertion the way a relying party would: type, challenge, origin, RP id hash,
 * user-present and user-verified flags, and the signature with the stored public key.
 */
export async function verifyAssertion(
  stored: StoredBiometric,
  assertion: Assertion,
  expected: { challenge: Uint8Array; origin: string; rpId: string },
): Promise<boolean> {
  try {
    const clientBytes = buf(assertion.clientDataJSON);
    const client = JSON.parse(new TextDecoder().decode(clientBytes)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (client.type !== 'webauthn.get') return false;
    if (client.challenge !== toB64(expected.challenge)) return false;
    if (client.origin !== expected.origin) return false;
    const auth = buf(assertion.authenticatorData);
    if (auth.length < 37) return false;
    const rpHash = await sha256(new TextEncoder().encode(expected.rpId));
    if (!bytesEqual(auth.slice(0, 32), rpHash)) return false;
    const flags = auth[32]!;
    if (!(flags & 0x01) || !(flags & 0x04)) return false;

    const signed = new Uint8Array(auth.length + 32);
    signed.set(auth, 0);
    signed.set(await sha256(clientBytes), auth.length);
    const spki = fromB64(stored.publicKey);
    const sig = buf(assertion.signature);
    if (stored.alg === ES256) {
      const key = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        derToRaw(sig),
        signed,
      );
    }
    if (stored.alg === RS256) {
      const key = await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
    }
    return false;
  } catch {
    return false;
  }
}

/** Asks the platform authenticator, then verifies its answer here. */
export async function unlockWithBiometric(stored: StoredBiometric): Promise<boolean> {
  const c = challenge();
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: c,
      allowCredentials: [{ type: 'public-key', id: fromB64(stored.id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred || toB64(cred.rawId) !== stored.id) return false;
  const r = cred.response as AuthenticatorAssertionResponse;
  return verifyAssertion(stored, r, {
    challenge: c,
    origin: window.location.origin,
    rpId: window.location.hostname,
  });
}

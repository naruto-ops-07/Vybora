import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  joinGroup,
  processPrivateMessage,
  processPublicMessage,
  zeroOutUint8Array,
  type ClientConfig,
  type ClientState,
  type KeyPackage,
  type Proposal,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { b64, utf8 } from './codec';
import {
  generateKeyPackages,
  parseCredential,
  type DeviceIdentity,
  type GeneratedKeyPackage,
} from './identity';
import { getSuite } from './suite';

export interface DirectoryDevice {
  deviceId: string;
  userId: string;
  identityKey: string; // base64 Ed25519 public key
  revoked: boolean;
}

/** Look up registered devices (server directory). Results may be cached by the caller. */
export interface DeviceDirectory {
  lookup(deviceId: string): Promise<DirectoryDevice | null>;
}

/**
 * MLS client config whose authentication service binds every leaf credential
 * to the server-registered identity key of that device. A member whose key
 * doesn't match the directory is rejected by MLS itself.
 */
export function makeClientConfig(directory: DeviceDirectory): ClientConfig {
  return {
    ...defaultClientConfig,
    authService: {
      async validateCredential(credential, signaturePublicKey) {
        const parsed = parseCredential(credential);
        if (!parsed) return false;
        const device = await directory.lookup(parsed.deviceId);
        return (
          !!device &&
          device.userId === parsed.userId &&
          device.identityKey === b64.encode(signaturePublicKey)
        );
      },
    },
  };
}

export interface GroupMember {
  leafIndex: number;
  userId: string;
  deviceId: string;
  identityKey: string;
}

export function epochOf(state: ClientState): number {
  return Number(state.groupContext.epoch);
}

export function membersOf(state: ClientState): GroupMember[] {
  const out: GroupMember[] = [];
  state.ratchetTree.forEach((node, nodeIndex) => {
    if (!node || node.nodeType !== 'leaf') return;
    const parsed = parseCredential(node.leaf.credential);
    if (!parsed) return;
    out.push({
      leafIndex: nodeIndex / 2,
      ...parsed,
      identityKey: b64.encode(node.leaf.signaturePublicKey),
    });
  });
  return out;
}

export async function createGroupState(
  identity: DeviceIdentity,
  conversationId: string,
  config: ClientConfig,
): Promise<ClientState> {
  const cs = await getSuite();
  const [own] = await generateKeyPackages(identity, 1);
  return createGroup(
    utf8.encode(conversationId),
    own!.publicPackage,
    own!.privatePackage,
    [],
    cs,
    config,
  );
}

export interface CommitResult {
  state: ClientState;
  commit: Uint8Array;
  welcome: Uint8Array | null;
}

/** Add devices (by key package) and/or remove leaves in one commit. */
export async function commitChanges(
  state: ClientState,
  changes: { add?: KeyPackage[]; removeLeaves?: number[] },
): Promise<CommitResult> {
  const cs = await getSuite();
  const proposals: Proposal[] = [
    ...(changes.removeLeaves ?? []).map((removed): Proposal => ({
      proposalType: 'remove',
      remove: { removed },
    })),
    ...(changes.add ?? []).map((keyPackage): Proposal => ({
      proposalType: 'add',
      add: { keyPackage },
    })),
  ];
  const result = await createCommit(
    { state, cipherSuite: cs },
    { ratchetTreeExtension: true, extraProposals: proposals },
  );
  result.consumed.forEach(zeroOutUint8Array);
  return {
    state: result.newState,
    commit: encodeMlsMessage(result.commit),
    welcome: result.welcome
      ? encodeMlsMessage({ welcome: result.welcome, wireformat: 'mls_welcome', version: 'mls10' })
      : null,
  };
}

/** Join from a Welcome using whichever of our private key packages it targets. */
export async function joinFromWelcome(
  welcomeBytes: Uint8Array,
  findKeyPackage: (refHex: string) => Promise<GeneratedKeyPackage | null>,
  config: ClientConfig,
): Promise<{ state: ClientState; usedRef: string }> {
  const cs = await getSuite();
  const decoded = decodeMlsMessage(welcomeBytes, 0)?.[0];
  if (!decoded || decoded.wireformat !== 'mls_welcome') throw new Error('not_a_welcome');
  for (const secret of decoded.welcome.secrets) {
    const ref = [...secret.newMember].map((b) => b.toString(16).padStart(2, '0')).join('');
    const kp = await findKeyPackage(ref);
    if (!kp) continue;
    const state = await joinGroup(
      decoded.welcome,
      kp.publicPackage,
      kp.privatePackage,
      emptyPskIndex,
      cs,
      undefined,
      undefined,
      config,
    );
    return { state, usedRef: ref };
  }
  throw new Error('welcome_not_for_this_device');
}

export async function encryptApplication(
  state: ClientState,
  plaintext: Uint8Array,
): Promise<{ state: ClientState; ciphertext: Uint8Array }> {
  const cs = await getSuite();
  const r = await createApplicationMessage(state, plaintext, cs);
  r.consumed.forEach(zeroOutUint8Array);
  return {
    state: r.newState,
    ciphertext: encodeMlsMessage({
      privateMessage: r.privateMessage,
      wireformat: 'mls_private_message',
      version: 'mls10',
    }),
  };
}

export type Incoming =
  | { kind: 'application'; state: ClientState; plaintext: Uint8Array }
  | { kind: 'commit'; state: ClientState };

/** Process a handshake or application message from another member. */
export async function processIncoming(state: ClientState, bytes: Uint8Array): Promise<Incoming> {
  const cs = await getSuite();
  const decoded = decodeMlsMessage(bytes, 0)?.[0];
  if (!decoded) throw new Error('malformed_mls_message');
  if (decoded.wireformat === 'mls_private_message') {
    const r = await processPrivateMessage(state, decoded.privateMessage, emptyPskIndex, cs);
    r.consumed.forEach(zeroOutUint8Array);
    return r.kind === 'applicationMessage'
      ? { kind: 'application', state: r.newState, plaintext: r.message }
      : { kind: 'commit', state: r.newState };
  }
  if (decoded.wireformat === 'mls_public_message') {
    const r = await processPublicMessage(state, decoded.publicMessage, emptyPskIndex, cs);
    r.consumed.forEach(zeroOutUint8Array);
    return { kind: 'commit', state: r.newState };
  }
  throw new Error(`unexpected_wireformat_${decoded.wireformat}`);
}

export function encodeState(state: ClientState): Uint8Array {
  return encodeGroupState(state);
}

export function decodeState(bytes: Uint8Array, config: ClientConfig): ClientState {
  const decoded = decodeGroupState(bytes, 0);
  if (!decoded) throw new Error('corrupt_group_state');
  return { ...decoded[0], clientConfig: config };
}

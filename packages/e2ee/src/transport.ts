/**
 * Everything the engine needs from the server. Implemented with supabase-js
 * in @vybora/api and with direct SQL in the database integration tests.
 * Every method carries only public key material or ciphertext.
 */
/** What anyone may learn about a device: its public identity key and status. */
export interface DeviceRecord {
  id: string;
  userId: string;
  identityKey: string;
  createdAt: string;
  revoked: boolean;
}

/** The owner's view of their own devices (Linked devices screen). */
export interface OwnDeviceRecord extends DeviceRecord {
  platform: string;
  label: string;
  lastSeenAt: string;
}

export interface EnvelopeRecord {
  seq: number;
  conversationId: string;
  senderId: string;
  senderDeviceId: string | null;
  epoch: number;
  kind: 'commit' | 'application';
  ciphertext: string; // base64
  clientId: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface WelcomeRecord {
  id: string;
  conversationId: string;
  epoch: number;
  commitSeq: number;
  welcome: string; // base64
}

export interface ConversationInfo {
  id: string;
  kind: 'direct' | 'group';
  epoch: number;
  memberIds: string[];
}

export interface PostedEnvelope {
  seq: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface ConnectTransport {
  registerDevice(input: {
    identityKey: string;
    platform: 'ios' | 'android' | 'web';
    label: string;
  }): Promise<string>;
  revokeDevice(deviceId: string): Promise<void>;
  touchDevice(deviceId: string): Promise<void>;
  countUnclaimedKeyPackages(deviceId: string): Promise<number>;
  publishKeyPackages(deviceId: string, packages: string[]): Promise<void>;
  getDevice(deviceId: string): Promise<DeviceRecord | null>;
  listDevices(userIds: string[]): Promise<DeviceRecord[]>;
  /** The signed-in user's own devices, including private metadata. */
  listOwnDevices(): Promise<OwnDeviceRecord[]>;
  claimKeyPackages(
    deviceIds: string[],
  ): Promise<{ deviceId: string; userId: string; keyPackage: string | null }[]>;
  getConversation(conversationId: string): Promise<ConversationInfo>;
  listWelcomes(conversationId: string, deviceId: string): Promise<WelcomeRecord[]>;
  deleteWelcome(id: string): Promise<void>;
  fetchEnvelopes(
    conversationId: string,
    afterSeq: number,
    limit: number,
  ): Promise<EnvelopeRecord[]>;
  postCommit(input: {
    conversationId: string;
    deviceId: string;
    epoch: number;
    commit: string;
    clientId: string;
    welcomes: { deviceId: string; welcome: string }[];
  }): Promise<number>;
  postApplication(input: {
    conversationId: string;
    deviceId: string;
    epoch: number;
    ciphertext: string;
    clientId: string;
    attachmentPaths: string[];
  }): Promise<PostedEnvelope>;
  /** Look up an envelope this device already posted (resolves duplicate-send retries). */
  findOwnEnvelope(deviceId: string, clientId: string): Promise<PostedEnvelope | null>;
  uploadAttachment(path: string, ciphertext: Uint8Array): Promise<void>;
  downloadAttachment(path: string): Promise<Uint8Array>;
}

export type ConnectErrorCode =
  | 'epoch_conflict'
  | 'epoch_stale'
  | 'duplicate'
  | 'not_ready'
  | 'device_revoked'
  | 'network'
  | 'forbidden'
  | 'unknown';

export class ConnectError extends Error {
  constructor(
    readonly code: ConnectErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ConnectError';
  }
}

/** Map a server/database error message to a ConnectError (shared by transports). */
export function toConnectError(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error;
  const e = error as { message?: string; code?: string };
  const m = e?.message ?? String(error);
  if (m.includes('epoch_conflict')) return new ConnectError('epoch_conflict', m);
  if (m.includes('epoch_stale')) return new ConnectError('epoch_stale', m);
  if (e?.code === '23505' || m.includes('duplicate key')) return new ConnectError('duplicate', m);
  if (m.includes('device_not_active')) return new ConnectError('device_revoked', m);
  if (e?.code === '42501' || m.includes('row-level security') || m.includes('not_a_member'))
    return new ConnectError('forbidden', m);
  if (/Failed to fetch|Network request failed|NetworkError|timeout|ECONN/i.test(m))
    return new ConnectError('network', m);
  return new ConnectError('unknown', m);
}

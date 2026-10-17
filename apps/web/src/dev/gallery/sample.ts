/**
 * Synthetic people, chats and messages for the dev gallery. Nothing here comes
 * from the network or a real account; the page labels it "Sample data".
 */
import { PERSON_TONES, personTone, type RowPreview, type ToneName } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';

export interface SamplePerson {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: null;
  tone: ToneName;
}

/** The first uuid-shaped id that hashes to `tone`, so every tone gets a stable sample person. */
function idForTone(tone: ToneName): string {
  for (let i = 1; ; i++) {
    const id = `5a3d1e00-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
    if (personTone(id) === tone) return id;
  }
}

const NAMES: Record<ToneName, [display: string | null, username: string]> = {
  turquoise: ['Maya Chen', 'maya'],
  emerald: ['Theo Park', 'theo.park'],
  lime: ['Ines Duarte', 'ines'],
  aqua: ['Kofi Mensah', 'kofi'],
  sky: ['Sana Iqbal', 'sana_i'],
  mint: [null, 'lukas_berg'],
  ocean: ['Aiko Tanaka', 'aiko'],
  glacier: ['Ravi', 'ravi.n'],
};

export const PEOPLE: Record<ToneName, SamplePerson> = Object.fromEntries(
  PERSON_TONES.map((tone) => {
    const [display_name, username] = NAMES[tone];
    return [tone, { id: idForTone(tone), username, display_name, avatar_path: null, tone }];
  }),
) as Record<ToneName, SamplePerson>;

export const ME: SamplePerson = {
  id: 'sample-me',
  username: 'you',
  display_name: 'You',
  avatar_path: null,
  tone: personTone('sample-me'),
};

export const nameOf = (p: SamplePerson) => p.display_name || p.username;

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

export interface SampleRow {
  id: string;
  title: string;
  kind: 'direct' | 'group';
  members: SamplePerson[];
  at: string;
  preview: RowPreview | null;
  unreadCount: number;
  pinned?: boolean;
  muted?: boolean;
  online?: boolean;
}

const text = (t: string, prefix: string | null = null): RowPreview => ({
  prefix,
  text: t,
  receipt: null,
  typing: false,
});

export function sampleRows(now: Date): SampleRow[] {
  const p = PEOPLE;
  return [
    {
      id: 'row-book',
      title: 'Book club',
      kind: 'group',
      members: [p.ocean, p.sky, p.glacier],
      at: minutesAgo(now, 90),
      preview: text('Chapter nine tonight?', 'Aiko'),
      unreadCount: 14,
      pinned: true,
      muted: true,
    },
    {
      id: 'row-maya',
      title: nameOf(p.turquoise),
      kind: 'direct',
      members: [p.turquoise],
      at: minutesAgo(now, 2),
      preview: text('See you at 7 then'),
      unreadCount: 2,
      online: true,
    },
    {
      id: 'row-crew',
      title: 'Weekend crew',
      kind: 'group',
      members: [p.emerald, p.lime, p.aqua],
      at: minutesAgo(now, 6),
      preview: { prefix: null, text: 'Theo is typing…', receipt: null, typing: true },
      unreadCount: 0,
    },
    {
      id: 'row-sana',
      title: nameOf(p.sky),
      kind: 'direct',
      members: [p.sky],
      at: minutesAgo(now, 48),
      preview: {
        prefix: 'You',
        text: 'Sent you the photos from Sunday',
        receipt: 'read',
        typing: false,
      },
      unreadCount: 0,
    },
    {
      id: 'row-lukas',
      title: p.mint.username,
      kind: 'direct',
      members: [p.mint],
      at: minutesAgo(now, 60 * 26),
      preview: null,
      unreadCount: 1,
    },
    {
      id: 'row-ravi',
      title: nameOf(p.glacier),
      kind: 'direct',
      members: [p.glacier],
      at: minutesAgo(now, 60 * 24 * 3),
      preview: { prefix: 'You', text: 'Voice message', receipt: 'delivered', typing: false },
      unreadCount: 0,
      muted: true,
    },
  ];
}

export const CREW = [PEOPLE.emerald, PEOPLE.lime, PEOPLE.aqua];

/** A group thread with runs, tails, replies, reactions, receipts and an unread divider. */
export function sampleThread(now: Date): {
  messages: LocalMessage[];
  receipts: Record<string, 'sending' | 'failed' | 'sent' | 'delivered' | 'read'>;
  lastReadSeq: number;
} {
  const { emerald: theo, lime: ines, aqua: kofi } = PEOPLE;
  let seq = 0;
  const msg = (
    from: SamplePerson,
    ago: number,
    body: string,
    extra: Partial<LocalMessage> = {},
  ): LocalMessage => ({
    id: `msg-${++seq}`,
    conversationId: 'row-crew',
    seq,
    senderId: from.id,
    senderDeviceId: null,
    createdAt: minutesAgo(now, ago),
    expiresAt: null,
    status: from === ME ? 'sent' : 'received',
    kind: 'text',
    body,
    reactions: {},
    ...extra,
  });
  const day = 60 * 24;
  const messages = [
    msg(ines, day + 180, 'Who’s around on Saturday?'),
    msg(kofi, day + 176, 'Me! What did you have in mind?'),
    msg(ME, day + 170, 'Count me in'),
    msg(theo, 42, 'Picnic at the lake, 2 pm'),
    msg(theo, 41, 'I’ll bring the big blanket and too many snacks', {
      reactions: { '👍': [ME.id, ines.id], '😂': [kofi.id] },
    }),
    msg(ines, 30, 'I can bring the speaker', {
      replyTo: { id: 'msg-5', senderId: theo.id, preview: 'I’ll bring the big blanket and too…' },
    }),
    msg(ines, 29, 'And a frisbee nobody will throw well'),
    msg(kofi, 20, '', { deleted: true }),
    msg(kofi, 12, 'This one disappears after a day', {
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    }),
    msg(ME, 8, 'Perfect, see you all there'),
    msg(ME, 7, 'I’ll grab ice on the way'),
    msg(ME, 1, 'Running five minutes late', { status: 'failed' }),
    msg(ME, 0, 'Sorry, bus!', { status: 'sending', seq: null }),
  ];
  return {
    messages,
    receipts: {
      'msg-3': 'read',
      'msg-10': 'read',
      'msg-11': 'delivered',
      'msg-12': 'failed',
      'msg-13': 'sending',
    },
    lastReadSeq: 5,
  };
}

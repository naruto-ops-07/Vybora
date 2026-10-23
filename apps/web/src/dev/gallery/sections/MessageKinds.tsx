/**
 * Wave A message kinds and actions, drawn by the real Bubble, PinBar, Composer and
 * dialogs with sample data: contact cards (from a fake "server profile"), drawn
 * locations, polls, view once, unsupported, mentions, edited / forwarded / starred.
 * Nothing is sent and nothing is fetched.
 */
import type { ConnectMember } from '@vybora/api';
import type { LocalMessage } from '@vybora/e2ee';
import { useMemo, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Bubble } from '@/features/connect/Bubble';
import { Composer } from '@/features/connect/Composer';
import { ForwardDialog } from '@/features/connect/ForwardDialog';
import {
  MessageKindsProvider,
  type ContactState,
  type MessageKinds,
} from '@/features/connect/kinds/context';
import { ViewOnceViewer, type ViewOnceMedia } from '@/features/connect/kinds/ViewOnce';
import { MessageInfoDialog } from '@/features/connect/MessageInfoDialog';
import { PinBar } from '@/features/connect/PinBar';
import { StarredDialog } from '@/features/connect/StarredDialog';
import { chatBackground, useChatTheme } from '@/features/connect/ui';
import { CREW, ME, nameOf, PEOPLE } from '../sample';
import { Frame } from './FirstRun';

const noop = () => undefined;
const THEME = {};
const people = [ME, ...CREW, PEOPLE.ocean, PEOPLE.sky];
const nameFor = (id: string) =>
  id === ME.id ? 'You' : nameOf(people.find((p) => p.id === id) ?? ME);
const [THEO, INES, KOFI] = CREW as [
  (typeof CREW)[number],
  (typeof CREW)[number],
  (typeof CREW)[number],
];
const AIKO = PEOPLE.ocean;
const SANA = PEOPLE.sky;
const UNKNOWN = '5a3d1e00-0000-4000-8000-ffffffffffff';
const LOADING = '5a3d1e00-0000-4000-8000-eeeeeeeeeeee';

/** The fake "server profile" lookup: what the real one returns, by user id only. */
function useSampleContact(userId: string): ContactState {
  if (userId === LOADING) return { status: 'loading' };
  const p = [AIKO, SANA].find((x) => x.id === userId);
  if (!p) return { status: 'missing' };
  return {
    status: 'found',
    relation: p === SANA ? 'friends' : 'none',
    profile: { id: p.id, username: p.username, displayName: p.display_name, avatarPath: null },
  };
}

function messages(now: Date): LocalMessage[] {
  const at = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const base = (id: string, senderId: string, min: number): LocalMessage => ({
    id,
    conversationId: 'sample',
    seq: 100 - min,
    senderId,
    senderDeviceId: null,
    createdAt: at(min),
    expiresAt: null,
    status: senderId === ME.id ? 'sent' : 'received',
    kind: 'text',
    reactions: {},
  });
  return [
    {
      ...base('k1', THEO.id, 40),
      body: `Found the place for Saturday, @[${INES.id}] you’ll love it`,
      mentions: [INES.id],
    },
    {
      ...base('k2', THEO.id, 39),
      kind: 'location',
      location: { lat: 38.71379, lng: -9.13358, label: 'Miradouro da Graça, Lisbon' },
    },
    {
      ...base('k3', ME.id, 36),
      kind: 'location',
      location: { lat: 38.70853, lng: -9.13651 },
    },
    {
      ...base('k4', INES.id, 30),
      kind: 'poll',
      poll: {
        question: 'What time works?',
        options: ['10:00', '12:30', 'After lunch'],
        multi: false,
        votes: { [THEO.id]: [1], [INES.id]: [1], [KOFI.id]: [0] },
      },
    },
    {
      ...base('k5', ME.id, 28),
      kind: 'poll',
      poll: {
        question: 'Bring along',
        options: ['Snacks', 'Speaker', 'Blanket'],
        multi: true,
        votes: { [ME.id]: [0, 2], [KOFI.id]: [2] },
      },
    },
    {
      ...base('k6', KOFI.id, 22),
      kind: 'contact',
      // The card's own names are the sender's words; they are never shown.
      contact: { userId: AIKO.id, username: 'spoofed', displayName: 'Not shown' },
    },
    {
      ...base('k7', ME.id, 21),
      kind: 'contact',
      contact: { userId: SANA.id, username: 'x', displayName: 'x' },
    },
    {
      ...base('k8', THEO.id, 20),
      kind: 'contact',
      contact: { userId: LOADING, username: 'x', displayName: 'x' },
    },
    {
      ...base('k9', INES.id, 19),
      kind: 'contact',
      contact: { userId: UNKNOWN, username: 'x', displayName: 'x' },
    },
    {
      ...base('k10', KOFI.id, 15),
      kind: 'attachment',
      viewOnce: { kind: 'image', consumed: false },
    },
    {
      ...base('k11', THEO.id, 14),
      kind: 'attachment',
      viewOnce: { kind: 'video', consumed: true },
    },
    {
      ...base('k12', ME.id, 13),
      kind: 'attachment',
      viewOnce: { kind: 'image', consumed: true },
    },
    { ...base('k13', INES.id, 9), kind: 'unsupported' },
    {
      ...base('k14', INES.id, 6),
      body: 'Train leaves at 9:40 from Rossio',
      forwarded: true,
      starred: true,
    },
    {
      ...base('k15', ME.id, 3),
      body: `Got it. @[${THEO.id}] can you grab the tickets?`,
      mentions: [THEO.id],
      edited: true,
    },
  ];
}

/** A small generated picture for the view-once viewer (no network). */
async function samplePhoto(): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 420;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 640, 420);
  grad.addColorStop(0, '#2b5876');
  grad.addColorStop(1, '#f0b37e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 420);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(470, 140, 54, 0, Math.PI * 2);
  g.fill();
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function Thread({ list }: { list: LocalMessage[] }) {
  const def = useChatTheme(THEME);
  return (
    <div className="bg-bg py-3" style={chatBackground(THEME, def)}>
      {list.map((m, i) => {
        const prev = list[i - 1];
        const next = list[i + 1];
        const mine = m.senderId === ME.id;
        const sender = people.find((p) => p.id === m.senderId);
        const runStart = prev?.senderId !== m.senderId;
        const runEnd = next?.senderId !== m.senderId;
        return (
          <Bubble
            key={m.id}
            message={m}
            mine={mine}
            theme={def}
            senderName={nameFor(m.senderId)}
            showSender={!mine && runStart}
            runStart={runStart}
            runEnd={runEnd}
            avatar={
              !mine && sender
                ? { path: null, name: sender.username, displayName: sender.display_name }
                : undefined
            }
            receipt={mine ? 'read' : undefined}
            myUserId={ME.id}
            nameOf={nameFor}
            onReact={noop}
            onCopy={noop}
            onReply={noop}
            onDelete={noop}
            onRetry={noop}
            onOpenImage={noop}
            onSelect={noop}
            actionContext={{ myUserId: ME.id, isGroup: true, canPin: true }}
            onMenuAction={noop}
            busy={m.id === 'k15'}
          />
        );
      })}
    </div>
  );
}

const member = (id: string, username: string, read: number, delivered: number): ConnectMember => ({
  id,
  username,
  display_name: nameFor(id),
  avatar_path: null,
  role: 'member',
  read_seq: read,
  delivered_seq: delivered,
});

export function MessageKindsSection() {
  const def = useChatTheme(THEME);
  const now = useMemo(() => new Date(), []);
  const list = useMemo(() => messages(now), [now]);
  const [dialog, setDialog] = useState<'forward' | 'info' | 'starred' | null>(null);
  const [media, setMedia] = useState<ViewOnceMedia | null>(null);
  const kinds = useMemo<MessageKinds>(
    () => ({
      isGroup: true,
      useContact: useSampleContact,
      onMessageContact: noop,
      onAddFriend: noop,
      onVote: () => new Promise<boolean>((r) => setTimeout(() => r(true), 1500)),
      onOpenViewOnce: () => void samplePhoto().then((bytes) => setMedia({ kind: 'image', bytes })),
    }),
    [],
  );
  const pins = [
    { messageId: 'k2', summary: 'Location: Miradouro da Graça, Lisbon' },
    { messageId: 'k4', summary: 'Poll: What time works?' },
    { messageId: 'k14', summary: 'Train leaves at 9:40 from Rossio' },
  ];
  const chats = [THEO, INES, KOFI, AIKO, SANA].map((p) => ({
    id: p.id,
    title: nameOf(p),
    avatar: (
      <Avatar
        path={null}
        name={p.username}
        userId={p.id}
        displayName={p.display_name}
        size={36}
        decorative
      />
    ),
  }));
  const open = (d: typeof dialog): ReactNode => (
    <Button variant="outline" size="sm" onClick={() => setDialog(d)}>
      {d === 'forward' ? 'Forward dialog' : d === 'info' ? 'Message info' : 'Starred messages'}
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" data-kinds-dialogs="">
        {open('forward')}
        {open('info')}
        {open('starred')}
      </div>
      <Frame label="A group chat: pin bar, the new kinds, mentions, edited (pending), forwarded">
        <div className="max-w-3xl" data-kinds-thread="">
          <PinBar pins={pins} onShow={noop} accent={def.accent} />
          <MessageKindsProvider value={kinds}>
            <Thread list={list} />
          </MessageKindsProvider>
          <Composer
            draftKey="gallery-edit"
            accent={def.accent}
            replyTo={null}
            onCancelReply={noop}
            onSend={noop}
            onFiles={noop}
            onTyping={noop}
            editing={{ id: 'k15', text: 'Got it. Theo can you grab the tickets?' }}
            onEdit={noop}
            onCancelEdit={noop}
          />
        </div>
      </Frame>

      <ForwardDialog
        open={dialog === 'forward'}
        chats={chats}
        onClose={() => setDialog(null)}
        onForward={() => setDialog(null)}
      />
      <MessageInfoDialog
        open={dialog === 'info'}
        onClose={() => setDialog(null)}
        message={list.at(-1)!}
        members={[
          member(ME.id, 'you', 99, 99),
          member(THEO.id, THEO.username, 99, 99),
          member(INES.id, INES.username, 0, 99),
          member(KOFI.id, KOFI.username, 0, 0),
        ]}
        nameOf={nameFor}
      />
      <StarredDialog
        open={dialog === 'starred'}
        onClose={() => setDialog(null)}
        scope="all"
        loading={false}
        messages={[list[13]!, list[1]!, list[3]!]}
        describe={(m) => ({ chat: 'Weekend crew', sender: nameFor(m.senderId), nameOf: nameFor })}
        onOpen={() => setDialog(null)}
      />
      <ViewOnceViewer media={media} onClose={() => setMedia(null)} />
    </div>
  );
}

/**
 * Wave A step 2b: composing and finding. The real composer with the @mention
 * picker open, the attach menu, the poll, contact and location dialogs, the
 * attachment preview with the view-once choice, the in-chat search bar and the
 * message results. Sample data only: nothing is sent and nothing is fetched.
 */
import type { Friend } from '@vybora/api';
import type { LocalMessage } from '@vybora/e2ee';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Composer } from '@/features/connect/Composer';
import { AttachmentPreview } from '@/features/connect/compose/AttachmentPreview';
import { ContactPicker } from '@/features/connect/compose/ContactPicker';
import { LocationShare } from '@/features/connect/compose/LocationShare';
import { PollDialog } from '@/features/connect/compose/PollDialog';
import { MessageResults } from '@/features/connect/search/MessageResults';
import { SearchBar } from '@/features/connect/search/SearchBar';
import { MentionJump } from '@/features/connect/ThreadParts';
import { useChatTheme } from '@/features/connect/ui';
import { CREW, ME, nameOf, PEOPLE } from '../sample';
import { Frame } from './FirstRun';

const noop = () => undefined;
const THEME = {};

const members = CREW.map((p) => ({
  id: p.id,
  name: nameOf(p),
  username: p.username,
  avatarPath: null,
}));
const friends: Friend[] = [...CREW, PEOPLE.ocean].map((p) => ({
  userId: p.id,
  username: p.username,
  displayName: p.display_name,
  avatarPath: null,
  since: '2026-09-01T00:00:00Z',
}));

const sampleFiles = () => [
  new File([new Uint8Array([0xff, 0xd8, 0xff, ...new Array(90_000).fill(0)])], 'rooftop.jpg', {
    type: 'image/jpeg',
  }),
];

const hit = (
  id: string,
  body: string,
  chat: string,
  sender: string,
  ranges: [number, number][],
) => ({
  message: {
    id,
    conversationId: 'c1',
    seq: 4,
    senderId: ME.id,
    senderDeviceId: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    expiresAt: null,
    status: 'received',
    kind: 'text',
    body,
    reactions: {},
  } as LocalMessage,
  chat,
  sender,
  text: body,
  ranges,
});

/** The real composer, nothing sent. With `demoText` ending in "@" the picker is open. */
function SampleComposer({ draftKey, demoText }: { draftKey: string; demoText?: string }) {
  const def = useChatTheme(THEME);
  return (
    <Composer
      draftKey={draftKey}
      accent={def.accent}
      replyTo={null}
      onCancelReply={noop}
      onSend={noop}
      onFiles={noop}
      onTyping={noop}
      members={members}
      demoText={demoText}
      onPoll={noop}
      onContact={noop}
      onLocation={noop}
    />
  );
}

export function ComposeSection() {
  const [dialog, setDialog] = useState<'poll' | 'contact' | 'location' | 'files' | null>(null);
  const [term, setTerm] = useState('cafe');
  const files = useMemo(sampleFiles, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" data-compose-dialogs="">
        <Button variant="outline" size="sm" onClick={() => setDialog('poll')}>
          New poll
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialog('contact')}>
          Share a contact
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialog('location')}>
          Share location
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialog('files')}>
          Attachment preview
        </Button>
      </div>

      <Frame label="Search in a chat, and the jump to a message that mentions me">
        <div className="max-w-3xl bg-bg" data-compose-chat="">
          <SearchBar
            open
            term={term}
            onTerm={setTerm}
            onClose={noop}
            onStep={noop}
            count={3}
            index={0}
            searching={false}
          />
          <div className="relative h-28">
            <MentionJump count={2} onClick={noop} />
          </div>
        </div>
      </Frame>

      {/* First in the section, so a screenshot of the attach menu finds this clip. */}
      <Frame label="The composer, with the attach menu open behind its clip">
        {/* Room above: the menu opens over the thread. */}
        <div className="max-w-3xl bg-bg pt-56" data-compose-composer="">
          <SampleComposer draftKey="gallery-attach" />
        </div>
      </Frame>

      <Frame label="The composer mid-sentence: the @mention picker">
        <div className="max-w-3xl bg-bg pt-56" data-compose-mentions="">
          <SampleComposer draftKey="gallery-mention" demoText="Ask @" />
        </div>
      </Frame>

      <Frame label="Messages found across chats">
        <div className="max-w-md bg-surface">
          <MessageResults
            hits={[
              hit('r1', 'The cafe on the corner at 7?', 'Weekend crew', 'Theo Park', [[4, 8]]),
              hit('r2', 'Cafe Bloom does the best pastel de nata', '', 'You', [[0, 4]]),
            ]}
            loading={false}
            term="cafe"
            onOpen={noop}
          />
        </div>
      </Frame>

      <PollDialog
        open={dialog === 'poll'}
        onClose={() => setDialog(null)}
        onSend={() => setDialog(null)}
      />
      <ContactPicker
        open={dialog === 'contact'}
        onClose={() => setDialog(null)}
        friends={friends}
        loading={false}
        onSend={() => setDialog(null)}
      />
      <LocationShare
        open={dialog === 'location'}
        onClose={() => setDialog(null)}
        onSend={() => setDialog(null)}
      />
      <AttachmentPreview
        files={dialog === 'files' ? files : []}
        onClose={() => setDialog(null)}
        onSend={() => setDialog(null)}
      />
    </div>
  );
}

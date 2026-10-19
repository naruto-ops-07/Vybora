import {
  ChatsCircleIcon,
  GearSixIcon,
  InfoIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Avatar, GroupAvatar, type AvatarPerson } from '@/components/ui/Avatar';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { toneVars } from '@/lib/tones';
import { Ambient } from '@/components/Ambient';
import { EASE_OUT } from './motion';

// Sample people for the illustration (ids picked so each lands on a different tone).
const MAYA: AvatarPerson = { id: 'landing-6', username: 'maya', display_name: 'Maya Chen' };
const THEO: AvatarPerson = { id: 'landing-1', username: 'theo', display_name: 'Theo Park' };
const INES: AvatarPerson = { id: 'landing-5', username: 'ines', display_name: 'Ines Duarte' };
const KOFI: AvatarPerson = { id: 'landing-0', username: 'kofi', display_name: 'Kofi Mensah' };
const CREW = [INES, THEO, MAYA];

const CHATS: {
  name: string;
  preview: string;
  time: string;
  unread: number;
  person?: AvatarPerson;
  group?: AvatarPerson[];
  active?: boolean;
}[] = [
  {
    name: 'Saturday crew',
    preview: 'Ines: I’ll bring the speaker',
    time: '18:04',
    unread: 3,
    group: CREW,
    active: true,
  },
  { name: 'Maya Chen', preview: 'Voice message', time: '17:20', unread: 0, person: MAYA },
  { name: 'Kofi Mensah', preview: 'You: see you at 7', time: 'Tue', unread: 0, person: KOFI },
  { name: 'Theo Park', preview: 'Photo', time: 'Mon', unread: 0, person: THEO },
];

const avatarOf = (p: AvatarPerson, size: number) => (
  <Avatar
    path={null}
    name={p.username}
    userId={p.id}
    displayName={p.display_name}
    username={p.username}
    size={size}
    decorative
  />
);

function Incoming({ from, text, time }: { from: AvatarPerson; text: string; time: string }) {
  return (
    <div className="flex items-end gap-2">
      {avatarOf(from, 26)}
      <div className="vy-bubble-in max-w-[70%] rounded-lg rounded-bl-sm px-3 py-2 text-sm">
        <span
          className="mb-0.5 block text-xs font-semibold"
          style={{ color: toneVars(from.id).text }}
        >
          {from.display_name}
        </span>
        {text}
        <span className="mt-0.5 block text-right font-mono text-[10px] text-subtle">{time}</span>
      </div>
    </div>
  );
}

/** A static, illustrative rendering of the real workspace (sample people, no live data). */
export function Showcase() {
  return (
    <section
      className="border-t border-line bg-surface py-20 md:py-28"
      aria-labelledby="showcase-title"
    >
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2 id="showcase-title" className="type-display text-4xl md:text-5xl">
            Your circle, in colour
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Everyone you talk to gets their own colour, the same on every device, so you can tell
            who’s talking at a glance. Groups, voice notes and photos on your phone, and the same
            chats in a roomy workspace on the web.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="mt-14 overflow-hidden rounded-lg border border-line bg-bg shadow-3"
          role="img"
          aria-label="Illustration of the VYBORA workspace: a chat list with friends in their own colours, an open group chat and the composer"
        >
          <div
            className="grid h-[480px] grid-cols-[56px_1fr] md:grid-cols-[64px_280px_1fr]"
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-3 border-r border-line bg-surface py-4">
              <LogoMark size={28} />
              <span className="mt-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent">
                <ChatsCircleIcon size={20} weight="fill" />
              </span>
              <span className="flex h-10 w-10 items-center justify-center text-muted">
                <UsersThreeIcon size={20} />
              </span>
              <span className="flex h-10 w-10 items-center justify-center text-muted">
                <GearSixIcon size={20} />
              </span>
            </div>
            <div className="hidden flex-col border-r border-line bg-surface md:flex">
              <div className="flex h-12 items-center justify-between border-b border-line px-4">
                <span className="type-display text-lg">Chats</span>
              </div>
              <div className="m-3 flex h-9 items-center gap-2 rounded-full bg-surface-muted px-3 text-xs text-subtle">
                <MagnifyingGlassIcon size={13} /> Search chats
              </div>
              {CHATS.map((c) => (
                <div
                  key={c.name}
                  className={cn(
                    'relative mx-2 flex items-center gap-3 rounded-md px-3 py-2.5',
                    c.active && 'bg-surface-strong',
                  )}
                  style={
                    c.active
                      ? { ['--avatar-ring' as string]: 'var(--vy-surface-strong)' }
                      : undefined
                  }
                >
                  {c.group ? <GroupAvatar members={c.group} size={40} /> : avatarOf(c.person!, 40)}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center text-sm font-medium">
                      <span className={cn('truncate', c.unread > 0 && 'font-semibold')}>
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          'ml-auto font-mono text-[10px]',
                          c.unread ? 'text-accent' : 'text-subtle',
                        )}
                      >
                        {c.time}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <span className="truncate">{c.preview}</span>
                      {c.unread > 0 && (
                        <span className="ml-auto min-w-[18px] rounded-full bg-primary-gradient px-1.5 text-center font-mono text-[10px] leading-[18px] text-on-primary">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="relative flex min-w-0 flex-col overflow-hidden">
              <Ambient />
              <div className="vy-panel vy-canvas-layer flex h-12 items-center gap-3 border-b px-4">
                <GroupAvatar members={CREW} size={34} />
                <span className="type-display text-base">Saturday crew</span>
                <span className="hidden items-center gap-1 font-mono text-[10px] text-subtle sm:flex">
                  <LockSimpleIcon size={10} /> end-to-end encrypted
                </span>
                <InfoIcon size={18} className="ml-auto text-muted" />
              </div>
              <div className="vy-canvas-layer flex flex-1 flex-col justify-end gap-2.5 p-4 md:p-6">
                <p className="mx-auto mb-2 font-mono text-[10px] text-subtle">Today</p>
                <Incoming from={INES} text="Picnic at the lake, 3 pm?" time="17:58" />
                <Incoming from={THEO} text="I’ll bring the big blanket" time="18:01" />
                <div className="ml-auto max-w-[70%] rounded-lg rounded-br-sm bg-bubble-out px-3 py-2 text-sm text-bubble-out-text shadow-1">
                  Count me in. Maya’s coming too
                  <span className="mt-0.5 block text-right font-mono text-[10px] opacity-80">
                    18:02 read
                  </span>
                </div>
                <Incoming from={INES} text="I’ll bring the speaker" time="18:04" />
              </div>
              <div className="vy-panel vy-canvas-layer flex items-center gap-2 border-t px-3 py-2.5">
                <PaperclipIcon size={18} className="text-muted" />
                <span className="h-9 flex-1 rounded-full border border-line bg-surface px-4 text-sm leading-9 text-subtle">
                  Message
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-gradient text-on-primary shadow-1">
                  <PaperPlaneRightIcon size={16} weight="fill" />
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

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
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { EASE_OUT } from './motion';

const CHATS = [
  {
    name: 'Maya Chen',
    preview: 'Signed copy attached',
    time: '09:42',
    unread: 0,
    color: '#1D4ED8',
    active: true,
  },
  {
    name: 'Design review',
    preview: 'Ari: shipping Thursday',
    time: '09:10',
    unread: 3,
    color: '',
    group: true,
  },
  { name: 'Jonas Weber', preview: 'Voice message', time: 'Tue', unread: 0, color: '#B45309' },
  { name: 'Priya N.', preview: 'See you there', time: 'Mon', unread: 0, color: '#047857' },
];

/** A static, illustrative rendering of the real workspace (no live data). */
export function Showcase() {
  return (
    <section
      className="border-t border-line bg-surface py-20 md:py-28"
      aria-labelledby="showcase-title"
    >
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2
            id="showcase-title"
            className="type-wide text-3xl font-semibold tracking-tight md:text-4xl"
          >
            Built for long conversations
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            A calm three-pane workspace on the web, the same chats on your phone. Keyboard
            shortcuts, a command palette and themes you can share with everyone in a chat.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="mt-12 overflow-hidden rounded-lg border border-line-strong bg-bg"
          role="img"
          aria-label="Illustration of the VYBORA workspace: chat list, an open conversation and the composer"
        >
          <div
            className="grid h-[460px] grid-cols-[56px_1fr] md:grid-cols-[64px_280px_1fr]"
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-5 border-r border-line bg-surface py-4">
              <LogoMark size={26} />
              <ChatsCircleIcon size={20} className="text-accent" />
              <GearSixIcon size={20} className="text-muted" />
            </div>
            <div className="hidden flex-col border-r border-line bg-surface md:flex">
              <div className="flex h-12 items-center justify-between border-b border-line px-4">
                <span className="type-wide text-sm font-semibold">Chats</span>
              </div>
              <div className="m-3 flex h-8 items-center gap-2 rounded-md border border-line-strong px-2.5 text-xs text-subtle">
                <MagnifyingGlassIcon size={13} /> Search chats
              </div>
              {CHATS.map((c) => (
                <div
                  key={c.name}
                  className={cn(
                    'relative flex items-center gap-3 px-4 py-2.5',
                    c.active && 'bg-surface-strong',
                  )}
                >
                  {c.active && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                  {c.group ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-strong text-accent">
                      <UsersThreeIcon size={16} />
                    </span>
                  ) : (
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: c.color }}
                    >
                      {c.name[0]}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center text-sm font-medium">
                      <span className="truncate">{c.name}</span>
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
                        <span className="ml-auto rounded-sm bg-accent px-1 font-mono text-[10px] text-on-accent">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1D4ED8] text-xs font-semibold text-white">
                  M
                </span>
                <span className="text-sm font-semibold">Maya Chen</span>
                <span className="flex items-center gap-1 font-mono text-[10px] text-subtle">
                  <LockSimpleIcon size={10} /> end-to-end encrypted
                </span>
                <InfoIcon size={18} className="ml-auto text-muted" />
              </div>
              <div className="flex flex-1 flex-col justify-end gap-2 p-4 md:p-6">
                <p className="mx-auto mb-2 font-mono text-[10px] text-subtle">Today</p>
                <div className="max-w-[70%] rounded-lg rounded-bl-sm border border-line bg-bubble-in px-3 py-2 text-sm">
                  Did the contract come through?
                  <span className="mt-0.5 block text-right font-mono text-[10px] text-subtle">
                    09:41
                  </span>
                </div>
                <div className="ml-auto max-w-[70%] rounded-lg rounded-br-sm bg-[#0F766E] px-3 py-2 text-sm text-white">
                  Yes. Sending it here so it stays between us.
                  <span className="mt-0.5 block text-right font-mono text-[10px] text-white/75">
                    09:42 read
                  </span>
                </div>
                <div className="ml-auto flex w-64 max-w-[70%] items-center gap-3 rounded-lg rounded-br-sm bg-[#0F766E] px-3 py-2.5 text-sm text-white">
                  <span className="font-mono text-[10px]">PDF</span>
                  <span className="min-w-0 flex-1 truncate">agreement-v3.pdf</span>
                  <span className="font-mono text-[10px] text-white/75">2.4 MB</span>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5">
                <PaperclipIcon size={18} className="text-muted" />
                <span className="h-9 flex-1 rounded-md border border-line-strong bg-bg px-3 text-sm leading-9 text-subtle">
                  Message
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-on-accent">
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

/**
 * Dev-only design gallery (`/__gallery`): the real presentational components
 * with synthetic data, for visual review and `scripts/gallery-shots.mjs`.
 * Registered only when `import.meta.env.DEV`; never in production bundles.
 * No network, no auth, no encryption engine.
 *
 * URL state: `?theme=light|dark` and `?contrast=high`, so screenshots are repeatable.
 */
import { useEffect, useLayoutEffect, useRef, type ComponentType } from 'react';
import { useSearchParams } from 'react-router';
import { Toggle } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { useA11y } from '@/features/a11y/A11yProvider';
import { ChatListSection } from './sections/ChatList';
import { EmptyStatesSection, GetStartedSection, HandleCardSection } from './sections/FirstRun';
import { GroupAvatarsSection } from './sections/GroupAvatars';
import { IllustrationsSection } from './sections/Illustrations';
import { ThreadSection } from './sections/Thread';
import { TonesSection } from './sections/Tones';

interface GallerySection {
  id: string;
  title: string;
  description: string;
  Component: ComponentType;
}

/**
 * Add new sections here, in reading order.
 * D3: composer with "Play sealed send", friend and request rows, the friendship-joined card
 *     (with a replay button).
 */
const SECTIONS: GallerySection[] = [
  {
    id: 'tones',
    title: 'Personal tones',
    description:
      'Eight tones, picked from each person’s id. Avatar fallbacks, and names on surface and on bubble-in.',
    Component: TonesSection,
  },
  {
    id: 'group-avatars',
    title: 'Group avatars',
    description:
      'The first two other members by id, overlapping. The front ring takes the background it sits on.',
    Component: GroupAvatarsSection,
  },
  {
    id: 'chat-list',
    title: 'Chat list',
    description:
      'ChatRowView, as in the inbox: unread, pinned, muted, typing, my last message, locked, selected.',
    Component: ChatListSection,
  },
  {
    id: 'illustrations',
    title: 'Illustrations',
    description:
      'Graphite line, tone and accent fills, our bubble tail and lock seal. They follow the theme and high contrast.',
    Component: IllustrationsSection,
  },
  {
    id: 'empty-states',
    title: 'Empty states',
    description:
      'Illustration, heading, one sentence, then actions. The welcome and friends states carry your HandleCard.',
    Component: EmptyStatesSection,
  },
  {
    id: 'get-started',
    title: 'Get started',
    description:
      'The first-run panel at the top of the chat list: 0 of 3, 2 of 3, and the one-time "You’re all set".',
    Component: GetStartedSection,
  },
  {
    id: 'handle-card',
    title: 'HandleCard',
    description:
      'Your @username with Copy and Share. Full on welcome and friends, compact in Get started.',
    Component: HandleCardSection,
  },
  {
    id: 'thread',
    title: 'Thread',
    description:
      'A group chat: runs and tails, sender names in tones, a reply, reactions, receipts, an unread divider.',
    Component: ThreadSection,
  },
];

type Theme = 'light' | 'dark';

export default function Gallery() {
  const [params, setParams] = useSearchParams();
  const theme: Theme = params.get('theme') === 'light' ? 'light' : 'dark';
  const highContrast = params.get('contrast') === 'high';
  const { prefs, setPrefs } = useA11y();

  const set = (key: 'theme' | 'contrast', value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  // Theme is local to this page: the saved app preference is restored on the way out.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const before = html.dataset.theme;
    html.dataset.theme = theme;
    return () => {
      if (before) html.dataset.theme = before;
    };
  }, [theme]);

  // High contrast goes through the real setting (bubbles read it); restored on unmount.
  const savedContrast = useRef(prefs.highContrast);
  useEffect(() => {
    setPrefs({ highContrast });
  }, [highContrast, setPrefs]);
  useEffect(() => {
    const saved = savedContrast.current;
    return () => setPrefs({ highContrast: saved });
  }, [setPrefs]);

  useEffect(() => {
    const before = document.title;
    document.title = 'Design gallery · VYBORA';
    return () => {
      document.title = before;
    };
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 flex-auto items-center gap-3">
            <h1 className="type-wide truncate text-lg font-semibold">Design gallery</h1>
            <span className="shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted">
              Sample data
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="w-40">
              <Segmented
                label="Theme"
                value={theme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => set('theme', v)}
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              High contrast
              <Toggle
                checked={highContrast}
                onChange={(on) => set('contrast', on ? 'high' : null)}
                label="High contrast"
              />
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 md:px-8">
        <p className="max-w-prose pt-6 text-sm leading-relaxed text-muted">
          Real components with synthetic people and messages. Nothing here touches the network or a
          real account. Development builds only.
        </p>
        <nav aria-label="Gallery sections" className="mt-2">
          <ul className="flex flex-wrap gap-x-5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex min-h-11 items-center text-sm font-medium text-accent underline-offset-2 hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {SECTIONS.map(({ id, title, description, Component }) => (
          <section
            key={id}
            id={id}
            aria-labelledby={`${id}-title`}
            className="mt-10 scroll-mt-24 border-t border-line pt-8"
          >
            <h2 id={`${id}-title`} className="type-wide text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
            <div className="mt-5">
              <Component />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

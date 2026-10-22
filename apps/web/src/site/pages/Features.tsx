import { Closing, WRAP } from '../parts/Closing';

/** Every group is something that works today (docs/FEATURE_STATUS.md), social first. */
const GROUPS: { title: string; intro: string; items: [string, string][] }[] = [
  {
    title: 'Friends',
    intro: 'Your people, without handing over your phone number.',
    items: [
      ['Add by username', 'Send a request to someone’s exact username. No phone number needed.'],
      ['Share your link', 'It opens VYBORA with your username already filled in for them.'],
      ['Requests in one place', 'Received and Sent tabs: accept, decline or cancel.'],
      ['Who can start chats', 'Everyone, or friends only. Block anyone at any time.'],
    ],
  },
  {
    title: 'Groups',
    intro: 'Plans, chaos and the group chat that never sleeps.',
    items: [
      ['Roles', 'Admins add and remove members, rename the group and manage settings.'],
      ['Admins-only settings', 'Keep the group’s settings in a few hands.'],
      ['A clean start', 'New members only see messages sent after they join.'],
      ['A colour each', 'Sender names in each person’s own colour, so you can follow along.'],
    ],
  },
  {
    title: 'Messages',
    intro: 'Everything you expect when you come from another messenger.',
    items: [
      ['Photos, video, files, voice', 'Up to 25 MB each, encrypted. Voice notes play on the web.'],
      ['Replies and reactions', 'Swipe or long-press to reply, react from the menu.'],
      ['Delete for everyone', 'Take back a message from the whole chat.'],
      ['Ticks, typing and last seen', 'Read receipts, typing and online status, each switchable.'],
      ['Disappearing messages', 'A timer per chat, from five minutes to a week.'],
      ['Mute, pin, archive', 'Keep the list the way you like it, per chat.'],
    ],
  },
  {
    title: 'Make it yours',
    intro: 'Three looks, each in light and dark, and a theme for every chat.',
    items: [
      ['Velvet', 'Warm black and ivory, deep emerald bubbles, champagne gold. The default.'],
      ['Aurora', 'Graphite and teal, teal to indigo bubbles, frosted panels.'],
      ['Bloom', 'Pearl and plum, sunset pink to orange bubbles, violet accents.'],
      ['Chat themes and wallpapers', 'Shared with the chat, or just for you.'],
      ['Nicknames and tones', 'Rename a contact just for you, and give a chat its own sound.'],
    ],
  },
  {
    title: 'Privacy',
    intro: 'Sealed on your device, every time.',
    items: [
      ['End-to-end encrypted', 'MLS (RFC 9420) in every chat. There is no unencrypted mode.'],
      ['Safety numbers', 'Compare with a friend to confirm nobody is in the middle.'],
      ['Linked devices', 'Each device has its own keys. Remove a lost one and it’s cut off.'],
      ['No content in notifications', 'Push notifications never carry message text.'],
    ],
  },
  {
    title: 'Accessibility',
    intro: 'Settings that are first-class, saved per device.',
    items: [
      ['Reduce motion', 'Follows your system, or set it yourself.'],
      ['Text size', 'Four sizes for messages, chat rows and the composer.'],
      ['High contrast', 'Flat colours at 7:1 in every look.'],
      ['Your gestures', 'Always-visible message actions, swipe to reply and haptics on or off.'],
    ],
  },
];

const NOT_YET = [
  'Voice and video calls',
  'Editing a sent message',
  'Group photos',
  'Recording voice notes on the web (they play there; record them on the phone app)',
];

export default function Features() {
  return (
    <>
      <section className="pb-16 pt-16 md:pb-24 md:pt-24" aria-labelledby="features-title">
        <div className={WRAP}>
          <h1
            id="features-title"
            className="type-display max-w-[14ch] text-[clamp(3rem,7vw,6rem)] leading-[0.95] tracking-[-0.02em]"
          >
            Everything VYBORA does today
          </h1>
          <p className="mt-7 max-w-[52ch] text-lg leading-relaxed md:text-xl">
            One-to-one and group chats with photos, video, files and voice notes, on your phone and
            the web. All of it end-to-end encrypted, and all of it yours to style.
          </p>
        </div>
      </section>

      {GROUPS.map((g, i) => (
        <section
          key={g.title}
          className={i % 2 === 0 ? 'bg-surface py-16 md:py-24' : 'py-16 md:py-24'}
          aria-labelledby={`group-${i}`}
        >
          <div className={`${WRAP} grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24`}>
            <div>
              <h2 id={`group-${i}`} className="type-display text-[clamp(2.25rem,4vw,3.5rem)]">
                {g.title}
              </h2>
              <p className="mt-3 max-w-[30ch] text-lg leading-relaxed text-muted">{g.intro}</p>
            </div>
            <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {g.items.map(([t, d]) => (
                <div key={t}>
                  <dt className="text-lg font-semibold">{t}</dt>
                  <dd className="mt-1.5 leading-relaxed text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <section className="py-16 md:py-24" aria-labelledby="not-yet-title">
        <div className={`${WRAP} grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24`}>
          <h2 id="not-yet-title" className="type-display text-[clamp(2.25rem,4vw,3.5rem)]">
            Not yet
          </h2>
          <div>
            <p className="max-w-[52ch] text-lg leading-relaxed">
              We’d rather tell you than let you find out. These aren’t built yet:
            </p>
            <ul className="mt-5 space-y-3 text-lg text-muted">
              {NOT_YET.map((n) => (
                <li key={n} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <Closing />
    </>
  );
}

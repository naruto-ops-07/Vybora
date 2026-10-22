import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  LockSimpleIcon,
  PlayIcon,
  ShareNetworkIcon,
  TimerIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';
import { Ambient } from '@/components/Ambient';
import { HOME_FAQ, SERVER } from '../content';
import { Face, INES, KOFI, MAYA, THEO, toneOf } from '../parts/Face';
import { PhonePreview } from '../parts/PhonePreview';
import { QaList } from '../parts/QaList';
import { AppLink } from '../SiteLayout';
import { Closing, WRAP } from '../parts/Closing';

function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <Ambient />
      <div
        className={`${WRAP} vy-canvas-layer grid items-center gap-12 pb-20 pt-12 md:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pb-28 lg:pt-20`}
      >
        <div className="min-w-0">
          <h1
            id="hero-title"
            className="type-display text-[clamp(3.25rem,8.4vw,6rem)] leading-[0.95] tracking-[-0.02em]"
          >
            Your people, <span className="block">in colour.</span>
          </h1>
          <p className="mt-7 max-w-[46ch] text-lg leading-relaxed md:text-xl">
            Chats with friends and groups, with photos, video and voice notes, in a messenger that
            looks as good as your plans. End-to-end encrypted, so only the people in the chat can
            read it.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <AppLink to="/signup">Create your account</AppLink>
            <AppLink to="/messages" variant="outline">
              Open web app
            </AppLink>
          </div>
          <p className="mt-6 text-sm text-muted">
            Sign up with an email address. No phone number needed.
          </p>
        </div>
        <PhonePreview />
      </div>
    </section>
  );
}

function Friends() {
  return (
    <section className="py-24 md:py-36" aria-labelledby="friends-title">
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-24`}>
        <div className="order-2 lg:order-1" data-ui="">
          <div className="max-w-[30rem] rounded-xl bg-surface p-6 shadow-2 md:p-8">
            <p className="text-sm text-muted">Your username</p>
            <p className="type-display mt-1 text-4xl md:text-5xl">@maya</p>
            <div className="mt-6 flex gap-2" aria-hidden="true">
              <span className="vy-btn vy-btn-secondary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold">
                <CopyIcon size={16} /> Copy
              </span>
              <span className="vy-btn vy-btn-primary inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold">
                <ShareNetworkIcon size={16} /> Share link
              </span>
            </div>
            <div className="mt-8 rounded-lg bg-surface-muted p-4">
              <p className="text-sm text-muted">Friend requests</p>
              {[THEO, KOFI].map((p, i) => (
                <div key={p.id} className="mt-3 flex items-center gap-3">
                  <Face person={p} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold" style={{ color: toneOf(p).text }}>
                      {p.name}
                    </span>
                    <span className="block text-sm text-muted">@{p.username}</span>
                  </span>
                  {i === 0 ? (
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                      <CheckIcon size={16} aria-hidden="true" /> Friends
                    </span>
                  ) : (
                    <span className="vy-btn vy-btn-primary inline-flex h-9 items-center rounded-sm px-3 text-[13px] font-semibold">
                      Accept
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <h2
            id="friends-title"
            className="type-display max-w-[14ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1]"
          >
            Friends by username, not by number
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed">
            Add people by their exact username, no phone number needed. Share your link and it opens
            VYBORA with your username already filled in. Choose whether only friends can start chats
            with you.
          </p>
          <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-muted">
            VYBORA never uploads your address book.
          </p>
        </div>
      </div>
    </section>
  );
}

function Groups() {
  const lines = [
    { p: INES, t: 'Who’s got the speaker?' },
    { p: KOFI, t: 'Me. Charged it last night' },
    { p: THEO, t: 'Blanket’s in the car' },
    { p: MAYA, t: 'Playlist is done, no skipping' },
  ];
  return (
    <section className="bg-surface py-24 md:py-36" aria-labelledby="groups-title">
      <div className={`${WRAP} grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-24`}>
        <div>
          <h2
            id="groups-title"
            className="type-display max-w-[13ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1]"
          >
            Everyone in the group has a colour
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed">
            Everyone you talk to gets their own colour, the same on every device, so you can tell
            who’s talking at a glance.
          </p>
          <dl className="mt-10 grid max-w-[34rem] gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Groups with roles</dt>
              <dd className="mt-1 leading-relaxed text-muted">
                Admins manage members and settings.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">A clean start</dt>
              <dd className="mt-1 leading-relaxed text-muted">
                New members only see messages sent after they join.
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col justify-center gap-3" data-ui="" aria-hidden="true">
          {lines.map(({ p, t }, i) => (
            <div
              key={p.id}
              className="flex items-end gap-3"
              style={{ marginLeft: `${[0, 8, 3, 12][i]}%` }}
            >
              <Face person={p} size={44} />
              <div className="vy-bubble-in rounded-xl rounded-bl-sm px-4 py-3 text-[17px]">
                <span className="block text-sm font-semibold" style={{ color: toneOf(p).text }}>
                  {p.name}
                </span>
                {t}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Moments() {
  return (
    <section className="py-24 md:py-36" aria-labelledby="moments-title">
      <div className={WRAP}>
        <h2
          id="moments-title"
          className="type-display max-w-[16ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1]"
        >
          Say it with a photo, a clip or your voice
        </h2>
        <div className="mt-14 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="space-y-6 text-lg leading-relaxed">
            <p>
              Send photos, videos, files and voice notes up to 25 MB, each one sealed on your
              device. Reply to a message, react to it, or delete it for everyone.
            </p>
            <p className="text-muted">
              Set a disappearing timer per chat, from five minutes to a week, and give every chat
              its own theme and wallpaper.
            </p>
            <Link
              to="/features"
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline"
            >
              Everything VYBORA does <ArrowRightIcon size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]" data-ui="" aria-hidden="true">
            <div className="site-photo row-span-2 flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-xl rounded-br-sm shadow-2">
              <span className="m-3 self-end rounded-full bg-black/70 px-2.5 py-1 font-mono text-[11px] text-white">
                Photo · 15:12
              </span>
            </div>
            <div className="vy-bubble-in flex items-center gap-3 rounded-xl rounded-bl-sm p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                <PlayIcon size={16} weight="fill" />
              </span>
              <span className="flex h-7 flex-1 items-center gap-[3px]">
                {[8, 14, 22, 12, 18, 26, 16, 9, 20, 24, 13, 8, 17, 21].map((h, k) => (
                  <span
                    key={k}
                    className="w-[3px] rounded-full bg-current opacity-60"
                    style={{ height: h }}
                  />
                ))}
              </span>
              <span className="font-mono text-xs text-muted">0:24</span>
            </div>
            <div className="vy-bubble-in flex items-center gap-3 rounded-xl rounded-bl-sm p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-accent">
                <FileIcon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">lake-trip-plan.pdf</span>
                <span className="font-mono text-xs text-muted">2.4 MB</span>
              </span>
            </div>
            <p className="flex items-center gap-2 self-start rounded-full bg-surface-muted px-4 py-2.5 text-sm text-muted sm:col-span-2 sm:justify-self-center">
              <TimerIcon size={16} className="text-accent" />
              Messages disappear 1 day after they’re sent
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section
      className="site-privacy bg-surface-strong py-24 md:py-36"
      aria-labelledby="privacy-title"
    >
      <div className={WRAP}>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-24">
          <div>
            <h2
              id="privacy-title"
              className="type-display max-w-[13ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1]"
            >
              Only the people in the chat can read it
            </h2>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed">
              Every chat uses MLS, the IETF standard for end-to-end encrypted group messaging. There
              is no unencrypted mode. End-to-end encryption protects what you say. It doesn’t hide
              that a conversation exists, so here is exactly where the line is.
            </p>
            <p className="mt-6 flex max-w-[48ch] items-start gap-3 rounded-lg bg-bg p-4 leading-relaxed">
              <LockSimpleIcon
                size={20}
                className="mt-0.5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>
                The encryption hasn’t been independently audited yet. We’ll say so here until one is
                published.
              </span>
            </p>
            <Link
              to="/privacy-and-security"
              className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline"
            >
              How the encryption works <ArrowRightIcon size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:pt-3">
            <div>
              <h3 className="type-display text-2xl">What our servers can’t see</h3>
              <ul className="mt-6 space-y-4">
                {SERVER.cannot.map((s) => (
                  <li key={s} className="flex items-start gap-3 leading-snug">
                    <CheckIcon
                      size={18}
                      className="mt-0.5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="type-display text-2xl">What they can</h3>
              <ul className="mt-6 space-y-4">
                {SERVER.can.map((s) => (
                  <li key={s} className="flex items-start gap-3 leading-snug text-muted">
                    <XIcon size={18} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="py-24 md:py-36" aria-labelledby="faq-title">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24`}>
        <div>
          <h2
            id="faq-title"
            className="type-display max-w-[12ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1]"
          >
            Questions, answered plainly
          </h2>
          <Link
            to="/faq"
            className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline"
          >
            All questions <ArrowRightIcon size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="border-t border-line">
          <QaList items={HOME_FAQ} />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Friends />
      <Groups />
      <Moments />
      <Privacy />
      <Questions />
      <Closing />
    </>
  );
}

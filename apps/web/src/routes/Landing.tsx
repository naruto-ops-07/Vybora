import {
  CheckIcon,
  DevicesIcon,
  FingerprintIcon,
  LockSimpleIcon,
  TimerIcon,
  UserPlusIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react';
import { MotionConfig } from 'motion/react';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useA11y } from '@/features/a11y/A11yProvider';
import { Faq } from './landing/Faq';
import { Hero } from './landing/Hero';
import { Journey } from './landing/Journey';
import { useSmoothScroll } from './landing/motion';
import { Showcase } from './landing/Showcase';

// Social first (what people come for), then what keeps it private.
const FEATURES = [
  {
    icon: <UserPlusIcon size={20} />,
    title: 'Friends by username',
    body: 'Add people by their exact username, no phone number needed. Choose whether only friends can start chats with you.',
  },
  {
    icon: <UsersThreeIcon size={20} />,
    title: 'Groups with roles',
    body: 'Admins manage members and settings. New members only see messages sent after they join.',
  },
  {
    icon: <TimerIcon size={20} />,
    title: 'Disappearing messages',
    body: 'Set a timer per chat, from five minutes to a week. Messages are removed from devices and the server.',
  },
  {
    icon: <DevicesIcon size={20} />,
    title: 'Phone and web',
    body: 'Each device has its own keys. Remove a lost device and it’s cut off from new messages immediately.',
  },
  {
    icon: <LockSimpleIcon size={20} />,
    title: 'Encrypted by default',
    body: 'Every chat uses MLS, the IETF standard for end-to-end encrypted group messaging. There is no unencrypted mode.',
  },
  {
    icon: <FingerprintIcon size={20} />,
    title: 'Verify, don’t trust',
    body: 'Compare a safety number with a contact to confirm nobody is in the middle. Key changes are flagged.',
  },
];

const SERVER = {
  cannot: [
    'Message text, replies and reactions',
    'Photos, videos, files and voice notes',
    'Your private keys',
    'Notification content',
  ],
  can: [
    'Who is in a conversation',
    'When encrypted messages are sent, and their size',
    'Group names and shared chat themes',
    'Your account details and profile',
  ],
};

export default function Landing() {
  const { reduceMotion } = useA11y();
  useSmoothScroll(!reduceMotion);
  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <div className="min-h-dvh bg-bg">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link to="/" aria-label="VYBORA home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
              <a
                href="#journey-title"
                className="hidden rounded-md px-3 py-2 text-sm text-muted hover:text-ink md:block"
              >
                How it works
              </a>
              <a
                href="#faq-title"
                className="hidden rounded-md px-3 py-2 text-sm text-muted hover:text-ink md:block"
              >
                Questions
              </a>
              <ButtonLink to="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup" size="sm" className="max-sm:hidden">
                Create account
              </ButtonLink>
            </nav>
          </div>
        </header>

        <main id="main">
          <Hero />

          <section className="border-y border-line bg-surface" aria-label="Features">
            <div className="mx-auto grid max-w-6xl gap-px border-x border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-surface px-5 py-8">
                  <span className="text-accent" aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </section>

          <Journey />
          <Showcase />

          <section className="border-t border-line py-20 md:py-28" aria-labelledby="servers-title">
            <div className="mx-auto max-w-6xl px-5">
              <h2
                id="servers-title"
                className="type-wide text-3xl font-semibold tracking-tight md:text-4xl"
              >
                What our servers can see
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
                End-to-end encryption protects what you say. It doesn’t hide that a conversation
                exists, so here is exactly where the line is.
              </p>
              <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
                <div className="bg-surface p-6">
                  <h3 className="font-semibold">Can’t see</h3>
                  <ul className="mt-4 space-y-3">
                    {SERVER.cannot.map((s) => (
                      <li key={s} className="flex items-start gap-3">
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
                <div className="bg-surface p-6">
                  <h3 className="font-semibold">Can see</h3>
                  <ul className="mt-4 space-y-3">
                    {SERVER.can.map((s) => (
                      <li key={s} className="flex items-start gap-3 text-muted">
                        <XIcon
                          size={18}
                          className="mt-0.5 shrink-0 text-subtle"
                          aria-hidden="true"
                        />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <Faq />

          <section className="bg-[#0F4C47] text-[#E6EEEE]">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 md:flex-row md:items-end md:justify-between md:py-24">
              <h2 className="type-display max-w-[16ch] text-4xl md:text-6xl">
                Bring your circle. Keep it between you.
              </h2>
              <div className="flex flex-wrap gap-3">
                <ButtonLink
                  to="/signup"
                  size="lg"
                  // Fixed colours on the fixed teal band (cn merges, so these replace the variant's).
                  className="bg-[#2DD4BF] text-[#04201D] hover:bg-[#5EEAD4]"
                >
                  Create your account
                </ButtonLink>
                <ButtonLink
                  to="/login"
                  size="lg"
                  variant="outline"
                  className="border-[#E6EEEE]/40 text-[#E6EEEE] hover:bg-white/10"
                >
                  Sign in
                </ButtonLink>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
            <Logo compact />
            <p>Encryption not yet independently audited.</p>
            <span>© {new Date().getFullYear()} VYBORA</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

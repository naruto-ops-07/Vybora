import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { LIMITS, SERVER } from '../content';
import { Closing, WRAP } from '../parts/Closing';
import { Journey } from '../parts/Journey';
import { SealDemo } from '../parts/SealDemo';

const H2 = 'type-display max-w-[16ch] text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.02]';

export default function PrivacySecurity() {
  return (
    <>
      <section className="pb-20 pt-16 md:pb-28 md:pt-24" aria-labelledby="privacy-page-title">
        <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20`}>
          <div>
            <h1
              id="privacy-page-title"
              className="type-display max-w-[17ch] text-[clamp(3rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.02em]"
            >
              Your words leave your device sealed
            </h1>
            <p className="mt-7 max-w-[50ch] text-lg leading-relaxed md:text-xl">
              Every message, photo and voice note is encrypted on your device before it’s sent, and
              only the people in the chat can open it. Here is how that works, what our servers can
              still see, and what we haven’t done yet.
            </p>
          </div>
          <SealDemo />
        </div>
      </section>

      <section className="bg-surface py-20 md:py-28" aria-labelledby="journey-title">
        <div className={WRAP}>
          <h2 id="journey-title" className={H2}>
            How a message travels
          </h2>
          <p className="mb-12 mt-5 max-w-[56ch] text-lg leading-relaxed text-muted">
            VYBORA uses MLS (RFC 9420), the IETF standard for end-to-end encrypted group messaging.
            Pick a step to follow one message.
          </p>
          <Journey />
        </div>
      </section>

      <section className="py-20 md:py-28" aria-labelledby="servers-title">
        <div className={WRAP}>
          <h2 id="servers-title" className={H2}>
            What our servers can see
          </h2>
          <p className="mt-5 max-w-[56ch] text-lg leading-relaxed">
            End-to-end encryption protects what you say. It doesn’t hide that a conversation exists,
            so here is exactly where the line is.
          </p>
          <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-20">
            <div>
              <h3 className="type-display text-2xl md:text-3xl">Can’t see</h3>
              <ul className="mt-6 space-y-4 text-lg">
                {SERVER.cannot.map((s) => (
                  <li key={s} className="flex items-start gap-3">
                    <CheckIcon
                      size={20}
                      className="mt-1 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="type-display text-2xl md:text-3xl">Can see</h3>
              <ul className="mt-6 space-y-4 text-lg text-muted">
                {SERVER.can.map((s) => (
                  <li key={s} className="flex items-start gap-3">
                    <XIcon size={20} className="mt-1 shrink-0 text-subtle" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface py-20 md:py-28" aria-labelledby="verify-title">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-2 lg:gap-20`}>
          <div>
            <h2 id="verify-title" className={H2}>
              Verify, don’t trust
            </h2>
            <p className="mt-5 max-w-[50ch] text-lg leading-relaxed">
              Compare a safety number with a contact to confirm nobody is in the middle. If
              someone’s keys change, VYBORA flags it in the chat.
            </p>
          </div>
          <div>
            <h2 className={H2}>Every device has its own keys</h2>
            <p className="mt-5 max-w-[50ch] text-lg leading-relaxed">
              Your phone and each browser you sign in on are separate devices. Remove a lost one
              under Privacy & security → Linked devices: it’s cut off from new messages immediately
              and erases its keys the next time it opens.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28" aria-labelledby="limits-title">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
          <h2 id="limits-title" className={H2}>
            What we haven’t done yet
          </h2>
          <div>
            <p className="max-w-[56ch] text-lg leading-relaxed">
              VYBORA’s encryption has not been independently audited. It uses MLS, an open standard,
              through an open-source library, and neither has had an independent security review. We
              won’t claim otherwise until one is published.
            </p>
            <ul className="mt-8 space-y-4 text-lg text-muted">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {l}
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

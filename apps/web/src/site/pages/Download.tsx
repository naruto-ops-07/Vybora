import { BrowserIcon, DeviceMobileIcon } from '@phosphor-icons/react';
import { Closing, WRAP } from '../parts/Closing';
import { AppLink } from '../SiteLayout';

export default function Download() {
  return (
    <>
      <section className="pb-20 pt-16 md:pb-28 md:pt-24" aria-labelledby="download-title">
        <div className={WRAP}>
          <h1
            id="download-title"
            className="type-display max-w-[12ch] text-[clamp(3rem,7vw,6rem)] leading-[0.95] tracking-[-0.02em]"
          >
            Get VYBORA
          </h1>
          <p className="mt-7 max-w-[50ch] text-lg leading-relaxed md:text-xl">
            Start in your browser today, on a laptop or a phone. There’s nothing to install.
          </p>
        </div>
      </section>

      <section className="bg-surface py-20 md:py-28" aria-labelledby="web-title">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
          <div className="flex items-center gap-4">
            <span className="vy-tile flex h-14 w-14 items-center justify-center rounded-lg text-accent">
              <BrowserIcon size={28} aria-hidden="true" />
            </span>
            <h2 id="web-title" className="type-display text-[clamp(2.25rem,4vw,3.5rem)]">
              On the web
            </h2>
          </div>
          <div>
            <p className="max-w-[52ch] text-lg leading-relaxed">
              Available now. VYBORA runs in your browser with the full workspace: your chat list,
              the open chat and its details side by side. Each browser you sign in on is its own
              device with its own keys.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <AppLink to="/signup">Create your account</AppLink>
              <AppLink to="/messages" variant="outline">
                Open web app
              </AppLink>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28" aria-labelledby="phone-title">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
          <div className="flex items-center gap-4">
            <span className="vy-tile flex h-14 w-14 items-center justify-center rounded-lg text-accent">
              <DeviceMobileIcon size={28} aria-hidden="true" />
            </span>
            <h2 id="phone-title" className="type-display text-[clamp(2.25rem,4vw,3.5rem)]">
              iPhone and Android
            </h2>
          </div>
          <div>
            <p className="max-w-[52ch] text-lg leading-relaxed">
              Not in the App Store or Google Play yet. There is a VYBORA phone app, but it hasn’t
              been released in the stores, so there’s nothing to install from them today.
            </p>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted">
              Until it is, open VYBORA in your phone’s browser. It’s the same account. A new device
              only sees messages sent after it’s added.
            </p>
            <div className="mt-8">
              <AppLink to="/messages" variant="outline">
                Open web app
              </AppLink>
            </div>
          </div>
        </div>
      </section>
      <Closing />
    </>
  );
}

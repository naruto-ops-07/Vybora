export const WRAP = 'mx-auto w-full max-w-[84rem] px-4 sm:px-6 lg:px-10';

/** The closing band every public page ends on, in the look's primary colours. */
export function Closing() {
  return (
    <section className="bg-primary-gradient text-on-primary" aria-labelledby="closing-title">
      <div
        className={`${WRAP} flex flex-col items-start gap-10 py-24 md:flex-row md:items-end md:justify-between md:py-32`}
      >
        <h2
          id="closing-title"
          className="type-display max-w-[14ch] text-[clamp(2.5rem,6vw,5rem)] leading-[1]"
        >
          Bring your circle. Keep it between you.
        </h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/signup"
            data-button=""
            className="vy-btn inline-flex h-12 items-center justify-center rounded-md bg-on-primary px-5 text-[15px] font-semibold text-[var(--vy-primary-from)] shadow-2 hover:bg-on-primary/90"
          >
            Create your account
          </a>
          <a
            href="/messages"
            data-button=""
            className="vy-btn inline-flex h-12 items-center justify-center rounded-md border border-on-primary/45 px-5 text-[15px] font-semibold text-on-primary hover:bg-on-primary/10"
          >
            Open web app
          </a>
        </div>
      </div>
    </section>
  );
}

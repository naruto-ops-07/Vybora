import { ALL_FAQ } from '../content';
import { Closing, WRAP } from '../parts/Closing';
import { QaList } from '../parts/QaList';

export default function FaqPage() {
  return (
    <>
      <section className="pb-24 pt-16 md:pb-32 md:pt-24" aria-labelledby="faq-page-title">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24`}>
          <div>
            <h1
              id="faq-page-title"
              className="type-display max-w-[11ch] text-[clamp(3rem,6.5vw,5.5rem)] leading-[0.95] tracking-[-0.02em] lg:sticky lg:top-28"
            >
              Questions, answered plainly
            </h1>
          </div>
          <div className="border-t border-line">
            <QaList items={ALL_FAQ} />
          </div>
        </div>
      </section>
      <Closing />
    </>
  );
}

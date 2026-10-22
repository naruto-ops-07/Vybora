import { PlusIcon } from '@phosphor-icons/react';
import type { Qa } from '../content';

/** Questions as native disclosures: they open without script and are all in the HTML. */
export function QaList({ items }: { items: Qa[] }) {
  return (
    <div className="site-qa">
      {items.map(({ q, a }) => (
        <details key={q} className="group border-b border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-lg font-medium">
            <h3>{q}</h3>
            <PlusIcon
              size={20}
              aria-hidden="true"
              className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <p className="max-w-[64ch] pb-6 text-[17px] leading-relaxed text-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}

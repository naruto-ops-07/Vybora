import { PlusIcon } from '@phosphor-icons/react';
import * as Accordion from '@radix-ui/react-accordion';

const QUESTIONS = [
  {
    q: 'Can VYBORA read my messages?',
    a: 'No. Messages and attachments are encrypted on your device with keys that only the people in the chat hold. Our servers store and relay ciphertext. They can see who is in a conversation and when messages are sent, but not what they say.',
  },
  {
    q: 'Has the encryption been audited?',
    a: 'Not yet. VYBORA uses MLS (RFC 9420), an open IETF standard, through an open-source library. Neither VYBORA nor that library has had an independent security audit, and we won’t claim otherwise until one is published.',
  },
  {
    q: 'What happens if I lose my phone?',
    a: 'Sign in on another device and remove the lost one under Privacy & security → Linked devices. It’s cut off from new messages immediately and erases its keys the next time it opens.',
  },
  {
    q: 'Do I need a phone number?',
    a: 'No. You sign up with an email address. Adding a phone number is optional, it’s hidden by default, and VYBORA never uploads your address book.',
  },
  {
    q: 'Can I use it on a computer?',
    a: 'Yes. VYBORA works in your browser and on iOS and Android. Each browser or phone is its own device with its own keys.',
  },
];

export function Faq() {
  return (
    <section className="border-t border-line py-20 md:py-28" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[0.8fr_1.2fr]">
        <h2 id="faq-title" className="type-wide text-3xl font-semibold tracking-tight md:text-4xl">
          Questions, answered plainly
        </h2>
        <Accordion.Root type="single" collapsible className="border-t border-line">
          {QUESTIONS.map(({ q, a }) => (
            <Accordion.Item key={q} value={q} className="border-b border-line">
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[17px] font-medium">
                  {q}
                  <PlusIcon
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-accent transition-transform duration-200 group-data-[state=open]:rotate-45"
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="faq-content overflow-hidden">
                <p className="max-w-[62ch] pb-5 leading-relaxed text-muted">{a}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}

import { LockSimpleIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { EASE_OUT, useScramble } from './motion';

const LINES = ['Your words', 'leave this', 'device sealed.'];

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Whatever you type is sealed in this browser (AES-GCM, throwaway key) and
 * shown the way a server would see it. Illustrative; real chats use MLS keys
 * held only by the members' devices.
 */
function SealDemo() {
  const [text, setText] = useState('Meet at 7. Bring the signed copy.');
  const [sealed, setSealed] = useState('');
  const key = useRef<Promise<CryptoKey> | null>(null);
  const shown = useScramble(sealed);

  useEffect(() => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    key.current ??= subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    let cancelled = false;
    const id = setTimeout(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        await key.current!,
        new TextEncoder().encode(text),
      );
      if (!cancelled) setSealed(toBase64(new Uint8Array([...iv, ...new Uint8Array(ct)])));
    }, 140);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-sm font-medium">Try it</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <LockSimpleIcon size={13} className="text-accent" aria-hidden="true" />
          Runs in your browser
        </span>
      </div>
      <div className="p-5">
        <label htmlFor="seal-input" className="text-sm text-muted">
          Type a message
        </label>
        <textarea
          id="seal-input"
          value={text}
          maxLength={280}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          className="mt-2 w-full resize-none rounded-md border border-line-strong bg-bg px-3 py-2.5 text-lg leading-snug focus:border-accent"
        />
      </div>
      <div className="border-t border-line bg-surface-muted p-5">
        <p className="text-sm text-muted">What the server stores</p>
        <p
          className="break-anywhere mt-2 min-h-[4.75rem] font-mono text-[13px] leading-relaxed text-accent"
          aria-live="polite"
          aria-label="Encrypted form of your message"
        >
          {shown || '…'}
        </p>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-subtle">
        A demonstration with a throwaway key. Real chats use MLS keys that only the members’ devices
        hold.
      </p>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pb-28 md:pt-24">
      <div>
        <h1 className="type-display text-[2.75rem] sm:text-6xl lg:text-[5.25rem]">
          {LINES.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className="block"
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 + i * 0.09 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55 }}
        >
          <p className="mt-7 max-w-[50ch] text-lg leading-relaxed text-muted">
            Chat with your friends and groups on your phone and the web. Every message, photo and
            voice note is sealed on your device before it’s sent, and only the people in the chat
            can open it.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink to="/signup" size="lg">
              Create your account
            </ButtonLink>
            <ButtonLink to="/login" size="lg" variant="outline">
              Sign in
            </ButtonLink>
          </div>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.35 }}
      >
        <SealDemo />
      </motion.div>
    </section>
  );
}

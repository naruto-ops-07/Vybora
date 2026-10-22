import { LockSimpleIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => {
  const attr =
    typeof document !== 'undefined' ? document.documentElement.dataset.reduceMotion : undefined;
  if (attr) return attr === 'true';
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
};

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Settles text into `target` with a brief left-to-right scramble, so a change
 * in ciphertext reads as "re-sealed". Instant with reduced motion.
 */
export function useScramble(target: string, duration = 420) {
  const [shown, setShown] = useState(target);
  const frame = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || !target) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const settled = Math.floor(target.length * p);
      let out = target.slice(0, settled);
      for (let i = settled; i < target.length; i++)
        out += target[i] === '=' ? '=' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setShown(out);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return shown;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Whatever you type is sealed in this browser (AES-GCM, throwaway key) and
 * shown the way a server would see it. Illustrative; real chats use MLS keys
 * held only by the members' devices.
 */
export function SealDemo() {
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
    <div
      data-seal-demo=""
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-3"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-accent" />
          </span>
          Try it
        </span>
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
          className="vy-field mt-2 w-full resize-none rounded-md px-3 py-2.5 text-lg leading-snug"
        />
      </div>
      <div className="border-t border-line bg-surface-muted p-5">
        <p className="flex items-center gap-2 text-sm text-muted">
          <LockSimpleIcon size={14} weight="fill" className="text-accent" aria-hidden="true" />
          What the server stores
        </p>
        <p
          className="break-anywhere mt-2 min-h-[4.75rem] font-mono text-[13px] leading-relaxed text-accent"
          aria-live="polite"
          aria-label="Encrypted form of your message"
        >
          {shown || '…'}
        </p>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-subtle">
        <span className="font-medium text-muted">End-to-end encrypted with MLS (RFC 9420).</span> A
        demonstration with a throwaway key. Real chats use MLS keys that only the members’ devices
        hold.
      </p>
    </div>
  );
}

import { LockSimpleIcon, PaperclipIcon, PaperPlaneRightIcon, XIcon } from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';

export interface ReplyDraft {
  id: string;
  senderId: string;
  preview: string;
  name: string;
}

export interface ComposerHandle {
  focus: () => void;
}

interface Props {
  accent: string;
  disabled?: boolean;
  disabledReason?: string;
  replyTo: ReplyDraft | null;
  onCancelReply: () => void;
  onSend: (text: string) => void;
  onFiles: (files: File[]) => void;
  onTyping: (typing: boolean) => void;
  draftKey: string;
}

const MAX = 4000;
const drafts = new Map<string, string>(); // in memory only: drafts never touch storage

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { accent, disabled, disabledReason, replyTo, onCancelReply, onSend, onFiles, onTyping, draftKey },
  ref,
) {
  const [text, setText] = useState(() => drafts.get(draftKey) ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  useEffect(() => {
    setText(drafts.get(draftKey) ?? '');
  }, [draftKey]);
  useEffect(() => {
    drafts.set(draftKey, text);
  }, [draftKey, text]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  const send = () => {
    const body = text.trim();
    if (!body || disabled) return;
    onSend(body.slice(0, MAX));
    setText('');
    onTyping(false);
  };

  if (disabled) {
    return (
      <div className="flex shrink-0 items-start gap-3 border-t border-line bg-surface px-5 py-4 text-sm text-muted">
        <LockSimpleIcon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p>{disabledReason}</p>
      </div>
    );
  }

  return (
    <div className="pb-safe shrink-0 border-t border-line bg-surface px-3 py-2.5 md:px-5">
      {replyTo && (
        <div
          className="mb-2 flex items-center gap-3 border-l-2 bg-surface-muted py-1.5 pl-3 pr-1"
          style={{ borderColor: accent }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold" style={{ color: accent }}>
              Replying to {replyTo.name}
            </p>
            <p className="truncate text-sm text-muted">{replyTo.preview}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCancelReply} aria-label="Cancel reply">
            <XIcon size={16} />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Tip label="Attach, encrypted, up to 25 MB" side="top">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInput.current?.click()}
            aria-label="Attach photo, video or file"
            className="text-muted"
          >
            <PaperclipIcon size={20} />
          </Button>
        </Tip>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) onFiles(files);
          }}
        />
        {/* The wrapper carries the focus ring so the textarea itself needs none. */}
        <div className="flex min-h-10 flex-1 items-center rounded-md border border-line-strong bg-bg px-3 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <textarea
            ref={area}
            rows={1}
            value={text}
            maxLength={MAX}
            onChange={(e) => {
              setText(e.target.value);
              onTyping(e.target.value.length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              } else if (e.key === 'Escape' && replyTo) onCancelReply();
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                onFiles(files);
              }
            }}
            placeholder="Message"
            aria-label="Message"
            className="max-h-[180px] w-full resize-none bg-transparent py-2 text-msg outline-none placeholder:text-subtle"
          />
        </div>
        <Button size="icon" onClick={send} disabled={!text.trim()} aria-label="Send">
          <PaperPlaneRightIcon size={18} weight="fill" />
        </Button>
      </div>
      {text.length > MAX - 200 && (
        <p className="mt-1 text-right font-mono text-[11px] text-subtle">
          {MAX - text.length} characters left
        </p>
      )}
    </div>
  );
});

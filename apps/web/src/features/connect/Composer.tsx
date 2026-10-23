import {
  CheckIcon,
  LockSimpleIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';
import { SendGlyph, useSealedSend } from './SealedSend';

export interface ReplyDraft {
  id: string;
  senderId: string;
  preview: string;
  name: string;
}

/** The message being edited: its id and current text (body or caption). */
export interface EditDraft {
  id: string;
  text: string;
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
  /**
   * Send the text. The sealed-send moment plays once this succeeds: right away
   * for `void`/`true`, when a returned promise resolves to anything but `false`,
   * and never for `false` or a rejection. Sending is never held up by it.
   */
  onSend: (text: string) => void | boolean | Promise<boolean | void>;
  onFiles: (files: File[]) => void;
  onTyping: (typing: boolean) => void;
  draftKey: string;
  /**
   * Edit mode: the box holds this message's text, Enter saves it through
   * `onEdit` and Esc cancels. Whatever was being typed comes back afterwards.
   */
  editing?: EditDraft | null;
  onEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  /** Gallery only: bump to play the seal without sending anything. */
  sealDemoRun?: number;
}

const MAX = 4000;
const drafts = new Map<string, string>(); // in memory only: drafts never touch storage

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  {
    accent,
    disabled,
    disabledReason,
    replyTo,
    onCancelReply,
    onSend,
    onFiles,
    onTyping,
    draftKey,
    editing,
    onEdit,
    onCancelEdit,
    sealDemoRun,
  },
  ref,
) {
  const [text, setText] = useState(() => editing?.text ?? drafts.get(draftKey) ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);
  const { reduceMotion } = useA11y();
  const seal = useSealedSend(reduceMotion);
  const { play } = seal;
  // A late result for a chat I've since left (or an unmounted composer) plays nothing.
  const liveKey = useRef<string | null>(draftKey);
  useEffect(() => {
    liveKey.current = draftKey;
    return () => {
      liveKey.current = null;
    };
  }, [draftKey]);

  useEffect(() => {
    if (sealDemoRun) play();
  }, [sealDemoRun, play]);

  useEffect(() => {
    setText(drafts.get(draftKey) ?? '');
  }, [draftKey]);
  // Edit mode borrows the box: the draft is kept aside (never overwritten) and restored.
  const editId = editing?.id ?? null;
  const editText = editing?.text ?? '';
  const editingNow = useRef<string | null>(null);
  useEffect(() => {
    if (editId === editingNow.current) return;
    editingNow.current = editId;
    if (editId) {
      setText(editText);
      requestAnimationFrame(() => {
        const el = area.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    } else setText(drafts.get(draftKey) ?? '');
    // Only a change of the message being edited resets the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  useEffect(() => {
    if (!editingNow.current) drafts.set(draftKey, text);
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
    if (editing) {
      onEdit?.(body.slice(0, MAX));
      return;
    }
    const result = onSend(body.slice(0, MAX));
    setText('');
    onTyping(false);
    if (result === false) return;
    if (result instanceof Promise) {
      const key = draftKey;
      result.then(
        (ok) => ok !== false && liveKey.current === key && play(),
        () => undefined,
      );
    } else play();
  };

  if (disabled) {
    return (
      <div className="vy-panel vy-canvas-layer flex shrink-0 items-start gap-3 border-t px-5 py-4 text-sm text-muted">
        <LockSimpleIcon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p>{disabledReason}</p>
      </div>
    );
  }

  return (
    <div className="vy-panel vy-canvas-layer pb-safe shrink-0 border-t px-3 py-3 md:px-5">
      {editing && (
        <div
          className="mb-2 flex items-center gap-3 rounded-sm border-l-[3px] bg-surface-muted py-1.5 pr-1 pl-3"
          style={{ borderColor: accent }}
        >
          <PencilSimpleIcon
            size={16}
            className="shrink-0"
            style={{ color: accent }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold" style={{ color: accent }}>
              Editing message
            </p>
            <p className="truncate text-sm text-muted">{editing.text}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCancelEdit} aria-label="Cancel edit">
            <XIcon size={16} />
          </Button>
        </div>
      )}
      {replyTo && !editing && (
        <div
          className="mb-2 flex items-center gap-3 rounded-sm border-l-[3px] bg-surface-muted py-1.5 pr-1 pl-3"
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
        {!editing && (
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
        )}
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
        <div className="vy-search flex min-h-10 flex-1 items-center rounded-lg px-3.5">
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
              } else if (e.key === 'Escape' && editing) {
                e.preventDefault();
                onCancelEdit?.();
              } else if (e.key === 'Escape' && replyTo) onCancelReply();
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                onFiles(files);
              }
            }}
            placeholder={editing ? 'Edit message' : 'Message'}
            aria-label={editing ? 'Edit message' : 'Message'}
            className="max-h-[180px] w-full resize-none bg-transparent py-2 text-msg outline-none placeholder:text-subtle"
          />
        </div>
        <Button
          size="icon"
          onClick={send}
          disabled={!text.trim()}
          aria-label={editing ? 'Save edit' : 'Send'}
          data-seal={seal.playing ? 'playing' : 'idle'}
          // While the seal plays the (now empty, disabled) button stays at full
          // strength, then settles back to its dimmed rest state.
          // Always the look's gradient coin (flat accent under high contrast, via
          // vy-btn-primary); "can't send yet" is the same circle, dimmed.
          data-send-button=""
          className={cn(
            'h-11 w-11 rounded-full transition-[color,background-color,opacity] duration-150',
            seal.playing && 'disabled:opacity-100',
          )}
        >
          {editing ? (
            <CheckIcon size={20} weight="bold" aria-hidden="true" />
          ) : (
            <SendGlyph run={seal.run} playing={seal.playing} />
          )}
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

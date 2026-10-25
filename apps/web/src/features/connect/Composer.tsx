import { CheckIcon, LockSimpleIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react';
import {
  displayToPayload,
  foldText,
  insertMentionDisplay,
  mentionQueryAt,
  type MentionEntry,
} from '@vybora/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';
import { AttachMenu } from './AttachMenu';
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
  /** As shown: mentions as `@Name` (see `entries`). */
  text: string;
  /** Editing an attachment's caption (at most 2000 characters). */
  caption?: boolean;
  /** The mentions in `text` (from `mentionsToDisplay`). */
  entries?: MentionEntry[];
  /** The stored body or caption (with `@[id]` tokens): saving it unchanged sends nothing. */
  source?: string;
}

/** Someone who can be @mentioned in this chat (never me). */
export interface MentionCandidate {
  id: string;
  name: string;
  username: string;
  avatarPath: string | null;
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
   * The body carries `@[id]` tokens; `mentions` is passed only when there are any.
   */
  onSend: (body: string, mentions?: string[]) => void | boolean | Promise<boolean | void>;
  onFiles: (files: File[]) => void;
  /** Group members for the @mention picker (groups only: none in a direct chat). */
  members?: readonly MentionCandidate[];
  /** Attach menu entries beyond files. */
  onPoll?: () => void;
  onContact?: () => void;
  onLocation?: () => void;
  onTyping: (typing: boolean) => void;
  draftKey: string;
  /**
   * Edit mode: the box holds this message's text, Enter saves it through
   * `onEdit` and Esc cancels. Whatever was being typed comes back afterwards.
   */
  editing?: EditDraft | null;
  onEdit?: (body: string, mentions?: string[]) => void;
  onCancelEdit?: () => void;
  /** Gallery only: bump to play the seal without sending anything. */
  sealDemoRun?: number;
  /** Gallery only: start with this in the box (and open the picker if it ends in a query). */
  demoText?: string;
}

const MAX = 4000;
/** In memory only: drafts never touch storage. Mentions picked so far ride along. */
const drafts = new Map<string, { text: string; entries: MentionEntry[] }>();
const draftOf = (key: string) => drafts.get(key) ?? { text: '', entries: [] };

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
    members,
    onPoll,
    onContact,
    onLocation,
    sealDemoRun,
    demoText,
  },
  ref,
) {
  const [text, setText] = useState(() => demoText ?? editing?.text ?? draftOf(draftKey).text);
  const [entries, setEntries] = useState<MentionEntry[]>(
    () => editing?.entries ?? draftOf(draftKey).entries,
  );
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

  // Edit mode borrows the box: the draft is kept aside (never overwritten) and restored.
  const editId = editing?.id ?? null;
  const editText = editing?.text ?? '';
  const editingNow = useRef<string | null>(null);
  useEffect(() => {
    // In edit mode the box belongs to the edit; the draft comes back when it ends.
    if (editingNow.current) return;
    const d = draftOf(draftKey);
    setText(d.text);
    setEntries(d.entries);
  }, [draftKey]);
  useEffect(() => {
    if (editId === editingNow.current) return;
    editingNow.current = editId;
    if (editId) {
      setText(editText);
      setEntries(editing?.entries ?? []);
      requestAnimationFrame(() => {
        const el = area.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    } else {
      const d = draftOf(draftKey);
      setText(d.text);
      setEntries(d.entries);
    }
    // Only a change of the message being edited resets the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  useEffect(() => {
    if (!editingNow.current) drafts.set(draftKey, { text, entries });
  }, [draftKey, text, entries]);

  // ---- @mention picker (an ARIA listbox the textarea controls)
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => {
    if (!members?.length || !query) return [];
    const q = foldText(query.query);
    return members
      .filter((m) => foldText(m.name).includes(q) || foldText(m.username).includes(q))
      .slice(0, 8);
  }, [members, query]);
  const picking = matches.length > 0;
  const readQuery = (el: HTMLTextAreaElement) => {
    if (!members?.length) return;
    const cursor = el.selectionStart ?? el.value.length;
    const next = el.selectionStart === el.selectionEnd ? mentionQueryAt(el.value, cursor) : null;
    setQuery((q) => (q?.start === next?.start && q?.query === next?.query ? q : next));
    if (next?.query !== query?.query || next?.start !== query?.start) setActive(0);
  };
  const pick = (m: MentionCandidate) => {
    const el = area.current;
    if (!el || !query) return;
    const cursor = el.selectionStart ?? text.length;
    const next = insertMentionDisplay(text, query.start, cursor, m.name);
    setText(next.text);
    setEntries((e) => [...e, { userId: m.id, name: m.name }]);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };
  const optionId = (i: number) => `${listId}-o${i}`;
  // The box grows with its text (up to 180 px): measured before paint whenever the
  // text or the edit changes, and again whenever its width changes (a narrow phone,
  // a banner appearing), so a pre-filled edit is never clipped.
  const fit = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);
  useLayoutEffect(fit, [text, editId, fit]);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, disabled]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);
  // Gallery only: show the picker as it looks mid-sentence.
  useEffect(() => {
    const el = area.current;
    if (!demoText || !el) return;
    el.setSelectionRange(demoText.length, demoText.length);
    readQuery(el);
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The payload as it will be sent: picked mentions become tokens.
  const payload = useMemo(() => displayToPayload(text.trim(), entries), [text, entries]);
  const limit = editing?.caption ? 2000 : MAX;
  const over = payload.body.length > limit;

  const send = () => {
    if (!payload.body || disabled || over) return;
    const args: [string, string[]?] = payload.mentions.length
      ? [payload.body, payload.mentions]
      : [payload.body];
    if (editing) {
      onEdit?.(...args);
      return;
    }
    const result = onSend(...args);
    setText('');
    setEntries([]);
    setQuery(null);
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancelEdit}
            aria-label="Cancel edit"
            className="touch-target"
          >
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="touch-target"
          >
            <XIcon size={16} />
          </Button>
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {picking && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention someone"
            className="menu vy-popover absolute bottom-full left-0 z-30 mb-2 max-h-72 w-[min(20rem,100%)] overflow-y-auto rounded-md p-1"
          >
            {matches.map((m, i) => (
              <li
                key={m.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                data-highlighted={i === active ? '' : undefined}
                // Keep focus (and the caret) in the textarea.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onPointerEnter={() => setActive(i)}
                className="vy-menu-item touch-target flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm"
              >
                <Avatar
                  path={m.avatarPath}
                  name={m.username}
                  userId={m.id}
                  displayName={m.name}
                  size={28}
                  decorative
                />
                <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                {/* Inherits the row's colour: the highlighted row is solid accent in high contrast. */}
                <span className="shrink-0 text-xs opacity-70">@{m.username}</span>
              </li>
            ))}
          </ul>
        )}
        {!editing && (
          <AttachMenu
            onFiles={() => fileInput.current?.click()}
            onPoll={onPoll}
            onContact={onContact}
            onLocation={onLocation}
          />
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
            maxLength={limit}
            aria-autocomplete={members?.length ? 'list' : undefined}
            aria-controls={picking ? listId : undefined}
            aria-activedescendant={
              picking ? optionId(Math.min(active, matches.length - 1)) : undefined
            }
            onChange={(e) => {
              setText(e.target.value);
              onTyping(e.target.value.length > 0);
              readQuery(e.target);
            }}
            onSelect={(e) => readQuery(e.currentTarget)}
            onKeyDown={(e) => {
              if (picking && !e.nativeEvent.isComposing) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const n = matches.length;
                  setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  pick(matches[Math.min(active, matches.length - 1)]!);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery(null);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              } else if (e.key === 'Escape' && editing) {
                // Only the edit ends: not select mode or the details panel behind it.
                e.preventDefault();
                e.stopPropagation();
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
          disabled={!text.trim() || over}
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
      {payload.body.length > limit - 200 && (
        <p className="mt-1 text-right font-mono text-[11px] text-subtle" aria-live="polite">
          {over ? 'Too long to send' : `${limit - payload.body.length} characters left`}
        </p>
      )}
    </div>
  );
});

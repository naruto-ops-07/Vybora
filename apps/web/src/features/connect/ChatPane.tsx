import {
  ArrowLeftIcon,
  CircleNotchIcon,
  InfoIcon,
  LockSimpleIcon,
  TimerIcon,
  UploadSimpleIcon,
  WarningIcon,
  WifiSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { fetchConnectPrivacy, isMuted, peerOf, qk, watchPresence } from '@vybora/api';
import { friendlyError, layoutThread, messageActions, receiptOf } from '@vybora/core';
import { MAX_ATTACHMENT_BYTES, type AttachmentRef, type LocalMessage } from '@vybora/e2ee';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useA11y } from '@/features/a11y/A11yProvider';
import { useMe } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useIncomingAnnouncement } from './announce';
import { Bubble } from './Bubble';
import { Composer, type ComposerHandle, type ReplyDraft } from './Composer';
import { useConnect } from './ConnectProvider';
import { DetailsPanel } from './DetailsPanel';
import {
  conversationTitle,
  MESSAGE_PAGE,
  messagePreview,
  useConversation,
  useNicknames,
  useSecureMessages,
  useTyping,
} from './hooks';
import { DateChip, groupByDay, JumpToLatest, UnreadDivider } from './ThreadParts';
import { threadKeyDown } from './threadKeys';
import { chatBackground, effectiveTheme, GroupAvatar, TypingDots, useChatTheme } from './ui';
import { VerifyDialog } from './VerifyDialog';

export const ttlLabel = (s: number) =>
  s >= 604800
    ? `${Math.round(s / 604800)}w`
    : s >= 86400
      ? `${Math.round(s / 86400)}d`
      : s >= 3600
        ? `${Math.round(s / 3600)}h`
        : `${Math.round(s / 60)}m`;

type AttachmentMeta = Omit<AttachmentRef, 'path' | 'key' | 'nonce' | 'sha256' | 'size'>;

async function describeFile(file: File): Promise<AttachmentMeta> {
  const mime = file.type || 'application/octet-stream';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
    try {
      const bmp = await createImageBitmap(file);
      const meta = { kind: 'image' as const, mime, width: bmp.width, height: bmp.height };
      bmp.close();
      return meta;
    } catch {
      return { kind: 'file', mime, name: file.name.slice(0, 200) };
    }
  }
  if (mime.startsWith('video/')) {
    const meta = await new Promise<{ width?: number; height?: number; durationMs?: number }>(
      (resolve) => {
        const v = document.createElement('video');
        const url = URL.createObjectURL(file);
        const done = (m: { width?: number; height?: number; durationMs?: number }) => {
          URL.revokeObjectURL(url);
          resolve(m);
        };
        v.preload = 'metadata';
        v.onloadedmetadata = () =>
          done({
            width: v.videoWidth || undefined,
            height: v.videoHeight || undefined,
            durationMs: Number.isFinite(v.duration)
              ? Math.min(600_000, Math.round(v.duration * 1000))
              : undefined,
          });
        v.onerror = () => done({});
        v.src = url;
      },
    );
    return { kind: 'video', mime, ...meta };
  }
  return { kind: 'file', mime, name: file.name.slice(0, 200) };
}

export default function ChatPane() {
  const { conversationId: id = '' } = useParams();
  const { userId } = useMe();
  const { engine } = useConnect();
  const toast = useToast();
  const conversation = useConversation(id);
  const conv = conversation.data;
  const nicknames = useNicknames();
  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId),
  });
  const [limit, setLimit] = useState(MESSAGE_PAGE);
  const { messages, syncState, live, hasMore } = useSecureMessages(id, limit);
  const { typingUsers, notifyTyping } = useTyping(id, privacy.data?.typing_indicators ?? true);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [deleting, setDeleting] = useState<LocalMessage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [uploads, setUploads] = useState(0);
  const [online, setOnline] = useState(false);
  const [details, setDetails] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const restoreFrom = useRef<number | null>(null);
  const composer = useRef<ComposerHandle>(null);

  const shared = conv?.theme ?? {};
  const theme = effectiveTheme(shared, conv?.localTheme ?? null, conv?.useLocalTheme ?? false);
  const def = useChatTheme(theme);
  const peer = conv ? peerOf(conv, userId) : null;
  const title = conv ? conversationTitle(conv, userId, nicknames.data) : '';
  const nameOf = useCallback(
    (uid: string) => {
      if (uid === userId) return 'You';
      const m = conv?.members.find((x) => x.id === uid);
      return nicknames.data?.[uid] ?? (m?.display_name || m?.username || 'Someone');
    },
    [conv, nicknames.data, userId],
  );

  useEffect(() => {
    setReplyTo(null);
    setLimit(MESSAGE_PAGE);
    setDetails((d) => d && window.matchMedia('(min-width: 1280px)').matches);
    stick.current = true;
  }, [id]);

  const peerId = peer?.id;
  useEffect(
    () => (peerId ? watchPresence(supabase, [peerId], (s) => setOnline(s.has(peerId))) : undefined),
    [peerId],
  );

  const keys = useQuery({
    queryKey: qk.connect.keys(peerId ?? ''),
    enabled: !!engine && !!peerId,
    queryFn: () => engine!.checkContactKeys(peerId!),
  });

  const ordered = useMemo(
    () =>
      [...(messages.data ?? [])].sort(
        (a, b) =>
          (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) ||
          a.createdAt.localeCompare(b.createdAt),
      ),
    [messages.data],
  );

  // The unread divider uses the read position from when the chat was opened,
  // so it doesn't vanish the moment this tab acknowledges the messages.
  const [readMark, setReadMark] = useState<{ id: string; seq: number; until: number } | null>(null);
  useEffect(() => {
    if (conv && readMark?.id !== id)
      setReadMark({ id, seq: conv.lastReadSeq, until: conv.lastSeq });
  }, [conv, id, readMark?.id]);

  const items = useMemo(
    () =>
      layoutThread(ordered, {
        myUserId: userId,
        lastReadSeq: readMark?.id === id ? readMark.seq : Number.MAX_SAFE_INTEGER,
        unreadUntilSeq: readMark?.id === id ? readMark.until : undefined,
        now: new Date(),
      }),
    [ordered, userId, readMark, id],
  );
  const days = useMemo(() => groupByDay(items), [items]);
  const newestId = ordered.at(-1)?.id;

  const { reduceMotion } = useA11y();
  const [away, setAway] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const lastSeenSeq = useRef(0);
  useEffect(() => {
    lastSeenSeq.current = 0;
    setNewCount(0);
    setAway(false);
  }, [id]);
  useEffect(() => {
    const newest = ordered.at(-1)?.seq ?? 0;
    if (stick.current || !lastSeenSeq.current) {
      setNewCount(0);
      lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
      return;
    }
    const fresh = ordered.filter(
      (m) => (m.seq ?? 0) > lastSeenSeq.current && m.senderId !== userId,
    ).length;
    if (fresh) setNewCount((c) => c + fresh);
    lastSeenSeq.current = Math.max(lastSeenSeq.current, newest);
  }, [ordered, userId]);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    setNewCount(0);
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const announcement = useIncomingAnnouncement(ordered, {
    ready: messages.isSuccess,
    userId,
    muted: conv ? isMuted(conv) || !conv.notificationsEnabled : true,
    conversationId: id,
    nameOf,
  });

  const replyById = (mid: string) => {
    const m = ordered.find((x) => x.id === mid);
    if (m && messageActions(m, m.senderId === userId).includes('reply')) {
      setReplyTo(m);
      composer.current?.focus();
    }
  };

  // Stay pinned to the newest message unless the reader scrolled up; keep the
  // reading position when older messages are prepended.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      // Wait for the larger page; then restore (or simply clear if nothing older existed).
      if (messages.isFetching) return;
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [ordered.length, typingUsers.length, id, messages.isFetching]);

  const positioned = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (positioned.current === id || readMark?.id !== id || !ordered.length) return;
    positioned.current = id;
    const divider = scroller.current?.querySelector<HTMLElement>('[data-unread-divider]');
    if (divider) {
      divider.scrollIntoView({ block: 'start' });
      stick.current = false;
    }
  }, [id, readMark, ordered.length]);

  const loadEarlier = () => {
    const el = scroller.current;
    if (el) restoreFrom.current = el.scrollHeight - el.scrollTop;
    stick.current = false;
    setLimit((l) => l + MESSAGE_PAGE);
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'not_ready')
        toast.show(
          'This browser is still being added to the conversation. Try again in a moment.',
          'error',
        );
      else if (code === 'network')
        toast.show('You appear to be offline. Use Retry on the message once you’re back.', 'error');
      else toast.show(friendlyError(e), 'error');
    }
  };

  const reply: ReplyDraft | null = replyTo
    ? {
        id: replyTo.id,
        senderId: replyTo.senderId,
        preview: messagePreview(replyTo).slice(0, 140),
        name: nameOf(replyTo.senderId),
      }
    : null;

  const sendText = (body: string) => {
    const r = reply
      ? { id: reply.id, senderId: reply.senderId, preview: reply.preview }
      : undefined;
    setReplyTo(null);
    stick.current = true;
    void run(() => engine!.send(id, { t: 'text', body, replyTo: r }));
  };

  const sendFiles = async (files: File[]) => {
    if (files.length > 10) toast.show('Up to 10 files at a time; sending the first 10.', 'info');
    for (const file of files.slice(0, 10)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.show(`${file.name} is larger than 25 MB.`, 'error');
        continue;
      }
      if (file.size === 0) {
        toast.show(`${file.name} is empty.`, 'error');
        continue;
      }
      setUploads((n) => n + 1);
      stick.current = true;
      try {
        const meta = await describeFile(file);
        const bytes = new Uint8Array(await file.arrayBuffer());
        await run(() => engine!.sendAttachment(id, bytes, meta));
      } finally {
        setUploads((n) => n - 1);
      }
    }
  };

  const jumpTo = (messageId: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (!el) {
      toast.show('That message is further back. Load earlier messages to see it.', 'info');
      return;
    }
    el.scrollIntoView({ block: 'center' });
    el.focus?.();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setDetails((d) => !d);
      } else if (e.key === 'Escape' && details && !document.querySelector('[role="dialog"]'))
        setDetails(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [details]);

  // Only once the inbox is settled: a just-created chat may not be in the cached list yet.
  if (conversation.isSuccess && !conversation.isFetching && !conv)
    return <Navigate to={`/messages/legacy/${id}`} replace />;

  const typingNames = typingUsers.map(nameOf);
  const subtitle = typingNames.length
    ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing`
    : conv?.kind === 'group'
      ? `${conv.members.length} members, encrypted`
      : online
        ? 'online'
        : 'end-to-end encrypted';
  const composerDisabled = syncState === 'waiting_for_access' || syncState === 'broken';

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div
        className="relative flex h-full min-w-0 flex-1 flex-col bg-bg"
        style={chatBackground(theme, def.accent)}
        onDragOver={(e) => {
          if (composerDisabled || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!composerDisabled) void sendFiles([...e.dataTransfer.files]);
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 md:px-4">
          <Link
            to="/messages"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-ink md:hidden"
            aria-label="Back to chats"
          >
            <ArrowLeftIcon size={20} />
          </Link>
          <button
            type="button"
            onClick={() => setDetails((d) => !d)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left"
            aria-label={`${title}, chat details`}
          >
            {conv?.kind === 'group' ? (
              <GroupAvatar size={34} />
            ) : (
              <Avatar path={peer?.avatar_path} name={peer?.username ?? '?'} size={34} />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{title || ' '}</span>
              <span
                className="flex items-center gap-1.5 font-mono text-[11px] leading-4"
                aria-live="polite"
              >
                {typingNames.length ? (
                  <TypingDots color={def.accent} />
                ) : online ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                ) : (
                  <LockSimpleIcon size={10} className="text-subtle" aria-hidden="true" />
                )}
                <span
                  className={online && !typingNames.length ? 'text-success' : 'text-subtle'}
                  style={typingNames.length ? { color: def.accent } : undefined}
                >
                  {subtitle}
                </span>
              </span>
            </span>
          </button>
          {conv?.disappearingSeconds ? (
            <span
              className="flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted"
              title="Disappearing messages are on"
            >
              <TimerIcon size={12} aria-hidden="true" /> {ttlLabel(conv.disappearingSeconds)}
              <span className="sr-only">disappearing messages</span>
            </span>
          ) : null}
          <Tip label="Details" shortcut="Alt I">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDetails((d) => !d)}
              aria-label="Chat details"
              aria-pressed={details}
              className={cn('text-muted', details && 'bg-surface-strong text-ink')}
            >
              <InfoIcon size={20} />
            </Button>
          </Tip>
        </header>

        {!live && (
          <div
            className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-warning-soft px-3 py-1.5 text-xs text-warning"
            role="status"
          >
            <WifiSlashIcon size={13} aria-hidden="true" /> Reconnecting — messages will sync
            automatically
          </div>
        )}
        {keys.data?.status === 'changed' && peer && (
          <button
            type="button"
            onClick={() => setVerifying(peer.id)}
            className="flex shrink-0 items-center gap-3 border-b border-line bg-warning-soft px-4 py-2.5 text-left text-sm"
          >
            <WarningIcon size={16} className="shrink-0 text-warning" aria-hidden="true" />
            <span className="flex-1">
              {nameOf(peer.id)}’s safety number changed. They may have a new device.{' '}
              <span className="font-semibold underline underline-offset-2">Verify</span>
            </span>
          </button>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scroller}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto py-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
              stick.current = distance < 80;
              setAway(distance > el.clientHeight);
              if (stick.current) setNewCount(0);
            }}
            onKeyDown={(e) => threadKeyDown(e, { onReply: replyById })}
            role="log"
            aria-label={`Messages with ${title}`}
          >
            {hasMore ? (
              <div className="mb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadEarlier}
                  loading={messages.isFetching}
                >
                  Load earlier messages
                </Button>
              </div>
            ) : (
              <p className="mx-auto mb-6 mt-2 flex max-w-sm items-start justify-center gap-2 px-6 text-center text-xs leading-relaxed text-muted">
                <LockSimpleIcon
                  size={13}
                  className="mt-0.5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                Messages and attachments in this chat are end-to-end encrypted. Only its members’
                devices can read them.
              </p>
            )}
            {(messages.isPending || (syncState === 'syncing' && !ordered.length)) && (
              <div className="flex justify-center py-8" style={{ color: def.accent }}>
                <CircleNotchIcon className="animate-spin" size={22} aria-label="Loading messages" />
              </div>
            )}
            {!messages.isPending && syncState !== 'syncing' && ordered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted">
                No messages yet. Say hello — it’s encrypted.
              </p>
            )}
            {days.map((day) => (
              <section key={day.key} aria-label={day.label}>
                {day.items.map((it) => {
                  if (it.type === 'date') return <DateChip key={it.key} label={it.label} />;
                  if (it.type === 'unread') return <UnreadDivider key={it.key} count={it.count} />;
                  const m = it.message;
                  const group = conv?.kind === 'group';
                  const sender = conv?.members.find((x) => x.id === m.senderId);
                  return (
                    <Bubble
                      key={it.key}
                      message={m}
                      mine={it.mine}
                      theme={def}
                      senderName={group ? nameOf(m.senderId) : undefined}
                      showSender={!!group && it.runStart}
                      runStart={it.runStart}
                      runEnd={it.runEnd}
                      avatar={
                        group && !it.mine
                          ? { path: sender?.avatar_path ?? null, name: sender?.username ?? '?' }
                          : undefined
                      }
                      tabbable={m.id === newestId}
                      receipt={receiptOf(m, userId, conv?.members ?? [])}
                      myUserId={userId}
                      nameOf={nameOf}
                      onReact={(msg, emoji) =>
                        void run(() =>
                          engine!.send(id, {
                            t: 'reaction',
                            target: msg.id,
                            emoji,
                            remove: !!msg.reactions[emoji]?.includes(userId),
                          }),
                        )
                      }
                      onReply={(msg) => {
                        setReplyTo(msg);
                        composer.current?.focus();
                      }}
                      onDelete={setDeleting}
                      onRetry={(msg) => void run(() => engine!.retry(id, msg.id))}
                      onOpenImage={setViewer}
                      onJumpTo={jumpTo}
                      onSelect={() => undefined}
                    />
                  );
                })}
              </section>
            ))}
            {uploads > 0 && (
              <div className="flex items-center justify-end gap-2 px-6 py-2 font-mono text-[11px] text-muted">
                <CircleNotchIcon className="animate-spin" size={13} aria-hidden="true" />
                Encrypting and uploading{uploads > 1 ? ` ${uploads} files` : ''}…
              </div>
            )}
          </div>
          {away && <JumpToLatest count={newCount} onClick={jumpToLatest} />}
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>

        <Composer
          ref={composer}
          draftKey={id}
          accent={def.accent}
          disabled={composerDisabled}
          disabledReason={
            syncState === 'broken'
              ? 'This browser lost its secure session for this chat. Another member’s device will re-add it automatically when they’re online.'
              : 'Setting up encryption for this browser. A member’s device adds it automatically when they’re online.'
          }
          replyTo={reply}
          onCancelReply={() => setReplyTo(null)}
          onSend={sendText}
          onFiles={(f) => void sendFiles(f)}
          onTyping={notifyTyping}
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-accent bg-surface/95">
            <UploadSimpleIcon size={30} className="text-accent" aria-hidden="true" />
            <p className="mt-3 font-semibold">Drop to send securely</p>
            <p className="text-sm text-muted">
              Encrypted before it leaves this browser. Up to 25 MB.
            </p>
          </div>
        )}
      </div>

      {details && conv && (
        <>
          <div
            className="scrim-in fixed inset-0 z-30 bg-scrim xl:hidden"
            onClick={() => setDetails(false)}
            aria-hidden="true"
          />
          <aside
            className="drawer-in fixed inset-y-0 right-0 z-40 w-full max-w-[380px] border-l border-line bg-surface xl:static xl:z-auto xl:w-[360px] xl:max-w-none"
            aria-label="Chat details"
          >
            <DetailsPanel
              conversation={conv}
              onClose={() => setDetails(false)}
              onVerify={setVerifying}
            />
          </aside>
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const m = deleting!;
          setDeleting(null);
          void run(() => engine!.send(id, { t: 'delete', target: m.id }));
        }}
        title="Delete for everyone?"
        description="This removes the message on every device in this chat."
        confirmLabel="Delete"
        danger
      />

      {verifying && conv && (
        <VerifyDialog userId={verifying} conversation={conv} onClose={() => setVerifying(null)} />
      )}

      {viewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onClick={() => setViewer(null)}
          onKeyDown={(e) => e.key === 'Escape' && setViewer(null)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <img src={viewer} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-md border border-white/30 text-white hover:bg-white/10"
            aria-label="Close photo"
          >
            <XIcon size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

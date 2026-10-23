import { qk, respondFriendRequest, sendFriendRequest, type SecureConversation } from '@vybora/api';
import {
  addFriendErrorNotice,
  addFriendResultNotice,
  canPin as mayPin,
  mentionIdsIn,
  messageSummary,
  pinWouldReplace,
  type MessageAction,
} from '@vybora/core';
import type { ConnectEngine, LocalMessage } from '@vybora/e2ee';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useActionAnnouncer } from './announce';
import type { EditDraft, ReplyDraft } from './Composer';
import { controlErrorText, MAX_CAPTION, type ControlKind } from './controlErrors';
import { ForwardDialog } from './ForwardDialog';
import { conversationTitle, useNicknames, useSecureInbox } from './hooks';
import type { ContactProfile, MessageKinds } from './kinds/context';
import { ADD_FRIEND_KEY, useServerContact } from './kinds/useServerContact';
import { ViewOnceViewer, type ViewOnceMedia } from './kinds/ViewOnce';
import { MessageInfoDialog } from './MessageInfoDialog';
import type { PinnedItem } from './PinBar';
import { StarredDialog } from './StarredDialog';
import { useOpenDirect } from './useOpenDirect';

/** A reply quote for a message: who wrote it and one line of what it says. */
export const replyDraftOf = (
  m: LocalMessage,
  nameOf: (id: string) => string,
  myUserId?: string,
): ReplyDraft => ({
  id: m.id,
  senderId: m.senderId,
  preview: messageSummary(m, { nameOf, myUserId }).slice(0, 140),
  name: nameOf(m.senderId),
});

/**
 * Everything the message menu and the new message kinds do in one chat: edit,
 * forward, star, pin, message info, reply privately, votes, view once and
 * contact cards, plus reactions and deletes with a pending state. Controls
 * change local state only once the server has stored them, so nothing here is
 * optimistic; the bubble shows "busy" while one is in flight.
 */
export function useChatActions({
  engine,
  conversationId: id,
  conv,
  userId,
  nameOf,
  jumpTo,
}: {
  engine: ConnectEngine | null;
  conversationId: string;
  conv: SecureConversation | undefined;
  userId: string;
  nameOf: (userId: string) => string;
  jumpTo: (messageId: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { text: announcement, announce } = useActionAnnouncer();
  const direct = useOpenDirect();
  const inbox = useSecureInbox();
  const nicknames = useNicknames();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [forwarding, setForwarding] = useState<LocalMessage | null>(null);
  const [infoFor, setInfoFor] = useState<LocalMessage | null>(null);
  const [replacePin, setReplacePin] = useState<LocalMessage | null>(null);
  const [starredOpen, setStarredOpen] = useState(false);
  const [viewOnce, setViewOnce] = useState<ViewOnceMedia | null>(null);
  const isGroup = conv?.kind === 'group';

  // Everything here belongs to one chat: switching chats closes its dialogs, and a
  // result that arrives late (a view once opening, a refused edit) is dropped.
  const liveId = useRef(id);
  useEffect(() => {
    liveId.current = id;
    setEditing(null);
    setForwarding(null);
    setInfoFor(null);
    setReplacePin(null);
    setStarredOpen(false);
    // Not the view-once viewer: it shows over any chat, and closing it would lose the view.
  }, [id]);
  const stillHere = (chat: string) => liveId.current === chat;

  const pins = useQuery({
    // Under the chat's messages key, so every engine change refreshes it.
    queryKey: [...qk.connect.messages(id), 'pins'],
    enabled: !!engine,
    queryFn: () => engine!.listPins(id),
  });
  const pinned = useQuery({
    queryKey: [...qk.connect.messages(id), 'pinned-messages', pins.data],
    enabled: !!engine && !!pins.data,
    queryFn: async () => {
      const out: LocalMessage[] = [];
      for (const p of pins.data ?? []) {
        const m = await engine!.getMessage(id, p.messageId);
        if (m && !m.deleted) out.push(m);
      }
      return out;
    },
  });
  const pinnedIds = useMemo(() => new Set((pins.data ?? []).map((p) => p.messageId)), [pins.data]);
  const pinItems: PinnedItem[] = useMemo(
    () =>
      (pinned.data ?? []).map((m) => ({
        messageId: m.id,
        summary: messageSummary(m, { nameOf, myUserId: userId }),
      })),
    [pinned.data, nameOf, userId],
  );

  const starred = useQuery({
    queryKey: [...qk.connect.messages(id), 'starred'],
    enabled: !!engine && starredOpen,
    queryFn: () => engine!.listStarred(id),
  });

  /** Mark a message busy while `fn` runs; explain a failure. Resolves to success. */
  const control = useCallback(
    async (kind: ControlKind, messageId: string | null, fn: () => Promise<unknown>) => {
      if (messageId) setBusy((b) => new Set(b).add(messageId));
      try {
        await fn();
        return true;
      } catch (e) {
        toast.show(controlErrorText(kind, e), 'error');
        return false;
      } finally {
        if (messageId)
          setBusy((b) => {
            const next = new Set(b);
            next.delete(messageId);
            return next;
          });
      }
    },
    [toast],
  );

  const react = useCallback(
    (m: LocalMessage, emoji: string) =>
      void control('reaction', m.id, () =>
        engine!.send(id, {
          t: 'reaction',
          target: m.id,
          emoji,
          remove: !!m.reactions[emoji]?.includes(userId),
        }),
      ),
    [control, engine, id, userId],
  );

  /**
   * Delete for everyone, one control per message. Offline (network/unknown) each one
   * is queued by the engine and goes out on the next sync, so a bulk delete keeps
   * going; only a refusal stops it. One message at the end, never one per bubble.
   */
  const remove = useCallback(
    async (targets: readonly string[]) => {
      let deleted = 0;
      let queued = 0;
      let failure: unknown = null;
      for (const target of targets) {
        setBusy((b) => new Set(b).add(target));
        try {
          await engine!.send(id, { t: 'delete', target });
          deleted++;
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'network' || code === 'unknown') queued++;
          else {
            failure = e;
            if (code === 'forbidden') break;
          }
        } finally {
          setBusy((b) => {
            const next = new Set(b);
            next.delete(target);
            return next;
          });
        }
      }
      if (failure) toast.show(controlErrorText('delete', failure), 'error');
      else if (queued === 1 && targets.length === 1)
        toast.show(controlErrorText('delete', { code: 'network' }), 'error');
      else if (queued)
        toast.show(
          `Couldn’t delete ${queued} ${queued === 1 ? 'message' : 'messages'} for everyone yet. They’ll retry when you’re back online.`,
          'error',
        );
      if (deleted) announce(deleted === 1 ? 'Message deleted' : `${deleted} messages deleted`);
    },
    [engine, id, announce, toast],
  );

  const pin = useCallback(
    async (m: LocalMessage, on: boolean) => {
      const ok = await control('pin', m.id, () => engine!.pin(id, m.id, on));
      if (ok) announce(on ? 'Message pinned' : 'Message unpinned');
    },
    [control, engine, id, announce],
  );

  const cancelEdit = useCallback(() => setEditing(null), []);
  const startEdit = (m: LocalMessage) =>
    setEditing({
      id: m.id,
      text: (m.kind === 'text' ? m.body : m.caption) ?? '',
      caption: m.kind !== 'text',
    });

  const saveEdit = useCallback(
    async (text: string) => {
      const target = editing;
      if (!target) return;
      if (target.caption && text.length > MAX_CAPTION) {
        // Kept open with the text: nothing was sent.
        setEditing({ ...target, text });
        toast.show('Captions can be up to 2000 characters', 'error');
        return;
      }
      setEditing(null);
      if (text === target.text) return;
      const chat = id;
      const members = new Set(conv?.members.map((x) => x.id) ?? []);
      const mentions = mentionIdsIn(text).filter((x) => members.has(x));
      let refused = false;
      const ok = await control('edit', target.id, async () => {
        try {
          await engine!.edit(chat, target.id, text, mentions.length ? mentions : undefined);
        } catch (e) {
          refused = (e as { code?: string }).code === 'forbidden';
          throw e;
        }
      });
      if (ok) announce('Message edited');
      // Refused (too late, or a mention left): give the words back to fix or cancel.
      else if (refused && stillHere(chat)) setEditing({ ...target, text });
    },
    [editing, conv, control, engine, id, announce, toast],
  );

  const star = useCallback(
    async (m: LocalMessage, on: boolean) => {
      try {
        await engine!.star(id, m.id, on);
        announce(on ? 'Message starred' : 'Star removed');
      } catch (e) {
        toast.show(controlErrorText(on ? 'star' : 'unstar', e), 'error');
      }
    },
    [engine, id, announce, toast],
  );

  const onMenuAction = useCallback(
    (a: MessageAction, m: LocalMessage) => {
      if (a === 'edit') startEdit(m);
      else if (a === 'forward') setForwarding(m);
      else if (a === 'star' || a === 'unstar') void star(m, a === 'star');
      else if (a === 'unpin') void pin(m, false);
      else if (a === 'pin') {
        if (pinWouldReplace(pins.data ?? [], m.id)) setReplacePin(m);
        else void pin(m, true);
      } else if (a === 'info') setInfoFor(m);
      else if (a === 'replyPrivately')
        void direct.open(m.senderId, nameOf(m.senderId), {
          reply: replyDraftOf(m, nameOf, userId),
        });
    },
    [star, pin, pins.data, direct, nameOf, userId],
  );

  const addFriend = useMutation({
    mutationKey: ADD_FRIEND_KEY,
    // Their request to me is accepted by id; otherwise a request by the RESOLVED username.
    mutationFn: async ({ profile: p, accept }: { profile: ContactProfile; accept: boolean }) => {
      if (accept) {
        await respondFriendRequest(supabase, p.id, true);
        return 'accepted' as const;
      }
      return sendFriendRequest(supabase, p.username);
    },
    onSuccess: (result, { profile: p }) => {
      const n = addFriendResultNotice(result, p.username);
      toast.show(n.text, n.tone);
      void qc.invalidateQueries({ queryKey: qk.connect.friendRequests });
      void qc.invalidateQueries({ queryKey: qk.connect.friends });
    },
    onError: (e) => {
      const n = addFriendErrorNotice(e);
      toast.show(n.text, n.tone);
    },
  });

  const opening = useRef(new Set<string>());
  const kinds = useMemo<MessageKinds>(
    () => ({
      isGroup,
      useContact: useServerContact,
      onMessageContact: (p) => void direct.open(p.id, p.displayName || `@${p.username}`),
      onAddFriend: (p, accept) => addFriend.mutate({ profile: p, accept }),
      onVote: async (poll, choices) => {
        const ok = await control('vote', null, () => engine!.vote(id, poll.id, choices));
        if (ok) announce(choices.length ? 'Vote counted' : 'Vote removed');
        return ok;
      },
      onOpenViewOnce: async (m) => {
        // One open at a time: a second tap while it decrypts does nothing.
        if (opening.current.has(m.id)) return;
        opening.current.add(m.id);
        const chat = id;
        try {
          const bytes = await engine!.consumeViewOnce(chat, m.id);
          // Consumed now, so it is shown even if the chat changed meanwhile.
          if (!bytes) {
            if (stillHere(chat)) toast.show('This was already opened.', 'info');
          } else setViewOnce({ kind: m.viewOnce?.kind ?? 'image', bytes, messageId: m.id });
        } catch (e) {
          if (stillHere(chat)) toast.show(controlErrorText('viewOnce', e), 'error');
        } finally {
          opening.current.delete(m.id);
        }
      },
    }),
    // `addFriend.mutate` and `direct.open` are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isGroup, direct.open, control, engine, id, announce, toast],
  );

  const actionContext = useMemo(
    () => ({
      myUserId: userId,
      isGroup,
      canPin: mayPin({ isGroup, settingsPolicy: conv?.settingsPolicy, myRole: conv?.myRole }),
    }),
    [userId, isGroup, conv?.settingsPolicy, conv?.myRole],
  );

  const forwardTargets = useMemo(
    () =>
      (inbox.data ?? [])
        .filter((c) => !c.archived || c.id === id)
        .map((c) => {
          const peer = c.kind === 'direct' ? c.members.find((x) => x.id !== userId) : undefined;
          return {
            id: c.id,
            title: conversationTitle(c, userId, nicknames.data),
            avatar:
              c.kind === 'group' ? (
                <GroupAvatar members={c.members.filter((x) => x.id !== userId)} size={36} />
              ) : (
                <Avatar
                  path={peer?.avatar_path}
                  name={peer?.username ?? '?'}
                  userId={peer?.id ?? c.id}
                  displayName={peer?.display_name}
                  size={36}
                  decorative
                />
              ),
          };
        }),
    [inbox.data, id, userId, nicknames.data],
  );

  /**
   * Forward to every chat picked, then say once how it went. A chat where the
   * forward is now a "Not sent" bubble is pointed at (its Retry), not offered again.
   */
  const forward = async (targets: string[]) => {
    const m = forwarding;
    if (!m) return;
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const titleOf = (c: string) => forwardTargets.find((t) => t.id === c)?.title ?? 'a chat';
    let done = 0;
    const failed: string[] = [];
    const waiting: string[] = [];
    for (const to of targets) {
      try {
        await engine!.forward(id, m.id, to, { nameOf });
        done++;
      } catch (e) {
        const recent = await engine!.listMessages(to, { limit: 5 }).catch(() => []);
        const bubble = recent.some(
          (x) =>
            x.status === 'failed' &&
            x.forwarded &&
            x.senderId === userId &&
            x.createdAt >= startedAt,
        );
        (bubble ? waiting : failed).push(titleOf(to));
        if (!bubble && targets.length === 1) {
          toast.show(controlErrorText('forward', e), 'error');
          setForwarding(null);
          return;
        }
      }
    }
    setForwarding(null);
    const n = targets.length;
    if (!failed.length && !waiting.length) {
      toast.show(n === 1 ? 'Forwarded' : `Forwarded to ${n} chats`, 'success');
      return;
    }
    const list = (xs: string[]) =>
      xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
    toast.show(
      [
        n > 1 ? `Forwarded to ${done} of ${n} chats.` : null,
        failed.length ? `Couldn’t forward to ${list(failed)}.` : null,
        waiting.length ? `Not sent to ${list(waiting)} yet: use Retry there.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      'error',
    );
  };

  const dialogs: ReactNode = (
    <>
      <ForwardDialog
        open={!!forwarding}
        chats={forwardTargets}
        onClose={() => setForwarding(null)}
        onForward={forward}
      />
      <MessageInfoDialog
        open={!!infoFor}
        onClose={() => setInfoFor(null)}
        message={infoFor}
        members={conv?.members ?? []}
        nameOf={nameOf}
        myUserId={userId}
      />
      <ConfirmDialog
        open={!!replacePin}
        onClose={() => setReplacePin(null)}
        onConfirm={() => {
          const m = replacePin!;
          setReplacePin(null);
          void pin(m, true);
        }}
        title="Replace the oldest pin?"
        description="A chat keeps 3 pins. This replaces the oldest pin."
        confirmLabel="Pin"
      />
      <StarredDialog
        open={starredOpen}
        onClose={() => setStarredOpen(false)}
        scope="chat"
        loading={starred.isPending}
        messages={starred.data ?? []}
        describe={(m) => {
          const who = conv?.members.find((x) => x.id === m.senderId);
          return {
            chat: '',
            sender: nameOf(m.senderId),
            nameOf,
            myUserId: userId,
            avatar: who
              ? { path: who.avatar_path, username: who.username, displayName: who.display_name }
              : undefined,
          };
        }}
        onOpen={(m) => {
          setStarredOpen(false);
          jumpTo(m.id);
        }}
      />
      <ViewOnceViewer media={viewOnce} onClose={() => setViewOnce(null)} />
    </>
  );

  return {
    kinds,
    busy,
    actionContext,
    pinnedIds,
    pinItems,
    onMenuAction,
    react,
    remove,
    editing,
    startEdit,
    saveEdit,
    cancelEdit,
    openStarred: () => setStarredOpen(true),
    announcement,
    dialogs,
  };
}

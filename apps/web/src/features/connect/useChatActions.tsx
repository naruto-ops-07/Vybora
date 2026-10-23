import { qk, sendFriendRequest, type SecureConversation } from '@vybora/api';
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
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useActionAnnouncer } from './announce';
import type { EditDraft, ReplyDraft } from './Composer';
import { controlErrorText, type ControlKind } from './controlErrors';
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
export const replyDraftOf = (m: LocalMessage, nameOf: (id: string) => string): ReplyDraft => ({
  id: m.id,
  senderId: m.senderId,
  preview: messageSummary(m, { nameOf }).slice(0, 140),
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
        summary: messageSummary(m, { nameOf }),
      })),
    [pinned.data, nameOf],
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

  const remove = useCallback(
    async (targets: readonly string[]) => {
      for (const target of targets) {
        const ok = await control('delete', target, () => engine!.send(id, { t: 'delete', target }));
        if (!ok) return;
      }
      announce(targets.length === 1 ? 'Message deleted' : `${targets.length} messages deleted`);
    },
    [control, engine, id, announce],
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
    setEditing({ id: m.id, text: (m.kind === 'text' ? m.body : m.caption) ?? '' });

  const saveEdit = useCallback(
    async (text: string) => {
      const target = editing;
      setEditing(null);
      if (!target || text === target.text) return;
      const members = new Set(conv?.members.map((x) => x.id) ?? []);
      const mentions = mentionIdsIn(text).filter((x) => members.has(x));
      const ok = await control('edit', target.id, () =>
        engine!.edit(id, target.id, text, mentions.length ? mentions : undefined),
      );
      if (ok) announce('Message edited');
    },
    [editing, conv, control, engine, id, announce],
  );

  const star = useCallback(
    async (m: LocalMessage, on: boolean) => {
      try {
        await engine!.star(id, m.id, on);
        announce(on ? 'Message starred' : 'Star removed');
      } catch (e) {
        toast.show(controlErrorText('reaction', e), 'error');
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
        void direct.open(m.senderId, nameOf(m.senderId), { reply: replyDraftOf(m, nameOf) });
    },
    [star, pin, pins.data, direct, nameOf],
  );

  const addFriend = useMutation({
    mutationKey: ADD_FRIEND_KEY,
    mutationFn: (p: ContactProfile) => sendFriendRequest(supabase, p.username),
    onSuccess: (result, p) => {
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

  const kinds = useMemo<MessageKinds>(
    () => ({
      isGroup,
      useContact: useServerContact,
      onMessageContact: (p) => void direct.open(p.id, p.displayName || `@${p.username}`),
      onAddFriend: (p) => addFriend.mutate(p),
      onVote: async (poll, choices) => {
        const ok = await control('vote', null, () => engine!.vote(id, poll.id, choices));
        if (ok) announce(choices.length ? 'Vote counted' : 'Vote removed');
        return ok;
      },
      onOpenViewOnce: (m) =>
        void (async () => {
          try {
            const bytes = await engine!.consumeViewOnce(id, m.id);
            if (!bytes) toast.show('This was already opened.', 'info');
            else setViewOnce({ kind: m.viewOnce?.kind ?? 'image', bytes });
          } catch (e) {
            toast.show(controlErrorText('forward', e), 'error');
          }
        })(),
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

  const forward = async (targets: string[]) => {
    const m = forwarding;
    if (!m) return;
    let done = 0;
    for (const to of targets) {
      try {
        await engine!.forward(id, m.id, to, { nameOf });
        done++;
      } catch (e) {
        toast.show(controlErrorText('forward', e), 'error');
        break;
      }
    }
    setForwarding(null);
    if (done) toast.show(done === 1 ? 'Forwarded' : `Forwarded to ${done} chats`, 'success');
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
        describe={(m) => ({ chat: '', sender: nameOf(m.senderId), nameOf })}
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

import { createSecureConversation, peerOf, qk, type SecureConversation } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { logDevError } from '@/lib/devLog';
import { supabase } from '@/lib/supabase';
import { setThreadIntent, type ThreadIntent } from './threadIntents';

/**
 * Open (or create) the direct chat with someone by user id, optionally carrying
 * an intent into it (a reply quote for "Reply privately"). The server dedupes
 * direct chats and decides whether we may message them at all.
 */
export function useOpenDirect() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId: me } = useMe();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const open = useCallback(
    async (userId: string, name: string, intent?: ThreadIntent) => {
      const existing = qc
        .getQueryData<SecureConversation[]>(qk.connect.inbox)
        ?.find((c) => c.kind === 'direct' && peerOf(c, me)?.id === userId);
      let id = existing?.id;
      if (!id) {
        setPendingId(userId);
        try {
          id = await createSecureConversation(supabase, 'direct', [userId]);
          void qc.invalidateQueries({ queryKey: qk.connect.inbox });
        } catch (e) {
          logDevError('open direct chat', e);
          toast.show(
            String((e as { message?: unknown }).message ?? '').includes('cannot_message')
              ? `You can’t message ${name} right now.`
              : friendlyError(e),
            'error',
          );
          return false;
        } finally {
          setPendingId(null);
        }
      }
      if (intent) setThreadIntent(id, intent);
      navigate(`/messages/${id}`);
      return true;
    },
    [qc, me, navigate, toast],
  );

  return { open, pendingId };
}

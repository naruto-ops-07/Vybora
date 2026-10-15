import { fetchUnreadCounts, qk, subscribeToNotifications } from '@vybora/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

/** Badge counts, kept fresh by a single realtime subscription per session. */
export function useUnreadCounts() {
  const { userId } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.unread,
    queryFn: () => fetchUnreadCounts(supabase),
    enabled: !!userId,
    refetchInterval: 120_000, // safety net if realtime is unavailable
  });

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(supabase, userId, () => {
      void qc.invalidateQueries({ queryKey: qk.unread });
      void qc.invalidateQueries({ queryKey: qk.notifications });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    });
    return unsubscribe;
  }, [userId, qc]);

  return query.data ?? { notifications: 0, conversations: 0 };
}

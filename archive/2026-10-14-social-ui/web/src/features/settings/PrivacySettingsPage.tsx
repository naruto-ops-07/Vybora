import { fetchSettings, qk, setPrivate, updateSettings } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function PrivacySettingsPage() {
  const { userId, profile } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: qk.settings(userId),
    queryFn: () => fetchSettings(supabase, userId),
  });

  const privacy = useMutation({
    mutationFn: (v: boolean) => setPrivate(supabase, userId, v),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: qk.me(userId) });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      toast.show(
        v
          ? 'Your account is now private'
          : 'Your account is now public. Pending requests were approved.',
        'success',
      );
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  const messages = useMutation({
    mutationFn: (followingOnly: boolean) =>
      updateSettings(supabase, userId, {
        message_privacy: followingOnly ? 'following' : 'everyone',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.settings(userId) }),
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  if (!profile || settings.isPending) return <PageSpinner />;

  return (
    <div>
      <h2 className="mb-2 font-display text-xl font-semibold">Privacy</h2>
      <div className="divide-y divide-line">
        <Switch
          label="Private account"
          description="Only approved followers can see your posts, reels, stories and follower lists. Your profile name and photo remain visible."
          checked={profile.is_private}
          disabled={privacy.isPending}
          onChange={(v) => privacy.mutate(v)}
        />
        <Switch
          label="Only people I follow can message me"
          description="Others won’t be able to start a new conversation with you. Existing conversations are unaffected."
          checked={settings.data?.message_privacy === 'following'}
          disabled={messages.isPending}
          onChange={(v) => messages.mutate(v)}
        />
      </div>
    </div>
  );
}

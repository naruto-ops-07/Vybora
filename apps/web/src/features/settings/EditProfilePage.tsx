import { qk, setAvatarPath, updateMyProfile, uploadObject } from '@vybora/api';
import { friendlyError, storagePaths } from '@vybora/core';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth, useMe } from '@/features/auth/AuthProvider';
import { prepareFile, releasePreview } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { ProfileForm } from './ProfileForm';
import { SettingsPage } from './SettingsNav';

export default function EditProfilePage() {
  const { userId, profile } = useMe();
  const { profileLoading } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (profileLoading || !profile)
    return (
      <SettingsPage title="Profile">
        <PageSpinner />
      </SettingsPage>
    );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.me(userId) });
    void qc.invalidateQueries({ queryKey: ['profile'] });
  };

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await prepareFile(file, 'avatar');
      releasePreview(media);
      const path = storagePaths.avatar(userId, crypto.randomUUID(), media.mime);
      await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
        bucket: 'avatars',
        path,
        body: media.body,
        contentType: media.mime,
      });
      // The old avatar is queued for deletion server-side when the path changes.
      await setAvatarPath(supabase, userId, path);
      refresh();
      toast.show('Profile photo updated', 'success');
    } catch (e) {
      toast.show(
        e instanceof Error && e.message.includes(':') ? e.message : friendlyError(e),
        'error',
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <SettingsPage title="Profile">
      <p className="text-sm text-muted">
        Your name, username, photo and about text are visible to signed-in people who search for
        you, so they can start a chat. Profile photos are not end-to-end encrypted.
      </p>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
        <Avatar path={profile.avatar_path} name={profile.username} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{profile.display_name || profile.username}</p>
          <p className="truncate font-mono text-[11px] text-subtle">@{profile.username}</p>
        </div>
        <div className="flex gap-2">
          {profile.avatar_path && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await setAvatarPath(supabase, userId, null);
                  refresh();
                } catch (e) {
                  toast.show(friendlyError(e), 'error');
                }
              }}
            >
              Remove
            </Button>
          )}
          <Button size="sm" loading={uploading} onClick={() => input.current?.click()}>
            Change photo
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void changeAvatar(e.target.files?.[0])}
        />
      </div>
      <ProfileForm
        initial={{
          username: profile.username,
          display_name: profile.display_name,
          bio: profile.bio,
          website: profile.website ?? '',
        }}
        onSubmit={async (values) => {
          await updateMyProfile(supabase, userId, values);
          refresh();
          toast.show('Profile saved', 'success');
        }}
      />
    </SettingsPage>
  );
}

import {
  createStory,
  fetchStoryTray,
  newMediaPath,
  qk,
  removeObjects,
  uploadObject,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { prepareFile, releasePreview } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';

export function StoryTray() {
  const { userId, profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { data, isPending } = useQuery({
    queryKey: qk.stories.tray,
    queryFn: () => fetchStoryTray(supabase),
    staleTime: 60_000,
  });

  const mine = data?.find((t) => t.is_me);
  const others = data?.filter((t) => !t.is_me) ?? [];

  const onPick = async (file: File | undefined) => {
    if (!file || !userId) return;
    let uploadedPath: string | null = null;
    try {
      const media = await prepareFile(file, 'story');
      releasePreview(media);
      const path = newMediaPath(userId, media.mime);
      setProgress(0);
      await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
        bucket: 'media',
        path,
        body: media.body,
        contentType: media.mime,
        onProgress: setProgress,
      });
      uploadedPath = path;
      await createStory(supabase, userId, {
        storage_path: path,
        media_type: media.mediaType,
        mime_type: media.mime,
        width: media.width ?? undefined,
        height: media.height ?? undefined,
        duration_ms: media.durationMs ?? undefined,
      });
      uploadedPath = null;
      toast.show('Added to your story', 'success');
      void qc.invalidateQueries({ queryKey: qk.stories.tray });
    } catch (e) {
      toast.show(
        e instanceof Error && e.message.includes(':') ? e.message : friendlyError(e),
        'error',
      );
      // Never leave an orphan object when the story row couldn't be created.
      if (uploadedPath)
        void removeObjects(supabase, 'media', [uploadedPath]).catch(() => undefined);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section
      aria-label="Stories"
      className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 py-3 sm:mx-0 sm:px-1"
    >
      <div className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
        <div className="relative">
          {mine ? (
            <Link to={`/stories/${mine.author_id}`} aria-label="View your story">
              <Avatar
                path={profile?.avatar_path}
                name={profile?.username ?? 'you'}
                size={62}
                ring="seen"
              />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label="Add to your story"
            >
              <Avatar
                path={profile?.avatar_path}
                name={profile?.username ?? 'you'}
                size={62}
                ring="none"
                className="m-1"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={progress !== null}
            aria-label="Add to your story"
            className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent ring-2 ring-surface"
          >
            {progress !== null ? <Spinner size={12} /> : <Plus size={14} strokeWidth={3} />}
          </button>
        </div>
        <span className="w-full truncate text-center text-xs text-muted">
          {progress !== null ? `${Math.round(progress * 100)}%` : 'Your story'}
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>

      {isPending &&
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
            <Skeleton className="h-[70px] w-[70px] rounded-full" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}

      {others.map((t) => (
        <Link
          key={t.author_id}
          to={`/stories/${t.author_id}`}
          className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
        >
          <Avatar
            path={t.avatar_path}
            name={t.username}
            size={62}
            ring={t.has_unseen ? 'unseen' : 'seen'}
          />
          <span className="w-full truncate text-center text-xs">{t.username}</span>
        </Link>
      ))}
    </section>
  );
}

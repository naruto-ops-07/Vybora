import {
  deleteStory,
  fetchAuthorStories,
  fetchStoryTray,
  fetchStoryViewers,
  markStoryViewed,
  qk,
} from '@vybora/api';
import { formatRelativeTime, friendlyError, IMAGE_STORY_MS, storyTimeLeft } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  Pause,
  Play,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { ReportDialog } from '@/features/posts/ReportDialog';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/lib/supabase';

export default function StoryViewerPage() {
  const { authorId = '' } = useParams();
  const { userId } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const tray = useQuery({ queryKey: qk.stories.tray, queryFn: () => fetchStoryTray(supabase) });
  const stories = useQuery({
    queryKey: qk.stories.author(authorId),
    queryFn: () => fetchAuthorStories(supabase, authorId),
  });
  const author = tray.data?.find((t) => t.author_id === authorId);
  const isMine = authorId === userId;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [dialog, setDialog] = useState<'viewers' | 'delete' | 'report' | null>(null);
  const items = stories.data ?? [];
  const story = items[index];
  const { data: url, isError: mediaError } = useSignedUrl(story?.storage_path);
  const video = useRef<HTMLVideoElement>(null);
  const holdPaused = paused || dialog !== null;

  // Start at the first unseen story? We start at 0 for predictability; reset on author change.
  useEffect(() => {
    setIndex(0);
    setProgress(0);
  }, [authorId]);

  const close = useCallback(() => navigate(-1), [navigate]);

  const nextAuthor = useCallback(() => {
    const list = tray.data ?? [];
    const pos = list.findIndex((t) => t.author_id === authorId);
    const next = list[pos + 1];
    if (next) navigate(`/stories/${next.author_id}`, { replace: true });
    else close();
  }, [tray.data, authorId, navigate, close]);

  const prevAuthor = useCallback(() => {
    const list = tray.data ?? [];
    const pos = list.findIndex((t) => t.author_id === authorId);
    const prev = list[pos - 1];
    if (prev) navigate(`/stories/${prev.author_id}`, { replace: true });
  }, [tray.data, authorId, navigate]);

  const next = useCallback(() => {
    setProgress(0);
    if (index + 1 < items.length) setIndex(index + 1);
    else nextAuthor();
  }, [index, items.length, nextAuthor]);

  const prev = useCallback(() => {
    setProgress(0);
    if (index > 0) setIndex(index - 1);
    else prevAuthor();
  }, [index, prevAuthor]);

  // Record a view (server ignores your own stories and duplicates).
  useEffect(() => {
    if (story && !isMine) {
      void markStoryViewed(supabase, userId, story.id).then(() =>
        qc.invalidateQueries({ queryKey: qk.stories.tray }),
      );
    }
  }, [story, isMine, userId, qc]);

  // Image timer (pausable). Video progress comes from the element itself.
  useEffect(() => {
    if (!story || story.media_type !== 'image' || !url || holdPaused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const np = p + dt / IMAGE_STORY_MS;
        if (np >= 1) {
          queueMicrotask(next);
          return 1;
        }
        return np;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story, url, holdPaused, next]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (holdPaused) v.pause();
    else void v.play().catch(() => setPaused(true));
  }, [holdPaused, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, close, dialog]);

  const viewers = useQuery({
    queryKey: qk.stories.viewers(story?.id ?? ''),
    queryFn: () => fetchStoryViewers(supabase, story!.id),
    enabled: isMine && !!story && dialog === 'viewers',
  });

  const remove = useMutation({
    mutationFn: () => deleteStory(supabase, story!.id),
    onSuccess: async () => {
      toast.show('Story deleted', 'success');
      setDialog(null);
      await qc.invalidateQueries({ queryKey: qk.stories.author(authorId) });
      void qc.invalidateQueries({ queryKey: qk.stories.tray });
      if (items.length <= 1) close();
      else setIndex((i) => Math.max(0, i - 1));
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-midnight"
      role="dialog"
      aria-modal="true"
      aria-label="Stories"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close stories"
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-white hover:bg-white/10"
      >
        <X size={26} />
      </button>
      <button
        type="button"
        onClick={prev}
        aria-label="Previous story"
        className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-midnight md:block"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next story"
        className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-midnight md:block"
      >
        <ChevronRight size={20} />
      </button>

      <div className="relative h-full w-full overflow-hidden bg-black md:h-[min(92vh,860px)] md:w-auto md:aspect-[9/16] md:rounded-[22px]">
        {stories.isPending ? (
          <div className="flex h-full items-center justify-center text-white">
            <Spinner size={28} label="Loading story" />
          </div>
        ) : !story ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No active stories"
              body="Stories disappear after 24 hours."
              className="text-white"
            />
          </div>
        ) : (
          <>
            {mediaError ? (
              <div className="flex h-full items-center justify-center text-sm text-white/70">
                This story can’t be loaded.
              </div>
            ) : !url ? (
              <div className="flex h-full items-center justify-center text-white">
                <Spinner size={28} />
              </div>
            ) : story.media_type === 'video' ? (
              <video
                key={story.id}
                ref={video}
                src={url}
                playsInline
                muted={muted}
                autoPlay
                className="h-full w-full object-contain"
                onTimeUpdate={(e) =>
                  setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))
                }
                onEnded={next}
              />
            ) : (
              <img
                key={story.id}
                src={url}
                alt={`Story by ${author?.username ?? 'user'}`}
                className="h-full w-full object-contain"
              />
            )}

            {/* Tap zones */}
            <button
              type="button"
              className="absolute inset-y-0 left-0 w-1/3"
              aria-label="Previous story"
              onClick={prev}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-2/3"
              aria-label="Next story"
              onClick={next}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onPointerLeave={() => setPaused(false)}
            />

            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 pb-10">
              <div className="flex gap-1" aria-hidden="true">
                {items.map((s, i) => (
                  <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                    <div
                      className="h-full bg-white"
                      style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2.5 text-white">
                <Link to={`/u/${author?.username ?? ''}`} className="flex items-center gap-2.5">
                  <Avatar path={author?.avatar_path} name={author?.username ?? '?'} size={32} />
                  <span className="text-sm font-semibold">{author?.username}</span>
                </Link>
                <span className="text-xs text-white/70">
                  {formatRelativeTime(story.created_at)}
                </span>
                {isMine && (
                  <span className="text-xs text-white/60">· {storyTimeLeft(story.expires_at)}</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {story.media_type === 'video' && (
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute' : 'Mute'}
                      className="rounded-full p-1.5 hover:bg-white/10"
                    >
                      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    aria-label={paused ? 'Play' : 'Pause'}
                    className="rounded-full p-1.5 hover:bg-white/10"
                  >
                    {paused ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex justify-between p-4 text-white">
              {isMine ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDialog('viewers')}
                    className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold"
                  >
                    <Eye size={16} /> Viewers
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog('delete')}
                    aria-label="Delete story"
                    className="rounded-full bg-black/40 p-2"
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setDialog('report')}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold"
                >
                  <Flag size={14} /> Report
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={dialog === 'viewers'} onClose={() => setDialog(null)} title="Viewers" size="sm">
        {viewers.isPending && <Spinner />}
        {viewers.data?.length === 0 && <p className="text-sm text-muted">No views yet.</p>}
        <ul className="space-y-2">
          {viewers.data?.map((v) => (
            <li key={v.id} className="flex items-center gap-3">
              <Avatar path={v.avatar_path} name={v.username} size={36} />
              <div className="leading-tight">
                <p className="text-sm font-semibold">{v.username}</p>
                <p className="text-xs text-subtle">{formatRelativeTime(v.viewed_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Delete this story?"
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      {story && (
        <ReportDialog
          open={dialog === 'report'}
          onClose={() => setDialog(null)}
          targetType="story"
          targetId={story.id}
        />
      )}
    </div>
  );
}

import {
  createPost,
  newMediaPath,
  qk,
  removeObjects,
  UploadCancelledError,
  uploadObject,
} from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { LIMITS } from '@vybora/validation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Clapperboard, ImagePlus, RotateCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { prepareFile, releasePreview, type PickedMedia } from '@/lib/media';
import { supabase, supabaseConfig } from '@/lib/supabase';

type Phase = 'editing' | 'uploading' | 'saving' | 'failed';

export default function CreatePage() {
  const { userId } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PickedMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [asReel, setAsReel] = useState(false);
  const [phase, setPhase] = useState<Phase>('editing');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Paths already in Storage for this draft (reused on retry, removed on abandon).
  const uploaded = useRef<Record<string, string>>({});
  const abort = useRef<AbortController | null>(null);
  const published = useRef(false);

  const canReel = items.length === 1 && items[0]?.mediaType === 'video';
  const kind = canReel && asReel ? 'reel' : 'post';

  // Cleanup: revoke previews and delete uploaded-but-unpublished objects.
  useEffect(() => {
    return () => {
      abort.current?.abort();
      const leftovers = Object.values(uploaded.current);
      if (!published.current && leftovers.length)
        void removeObjects(supabase, 'media', leftovers).catch(() => undefined);
    };
  }, []);
  useEffect(() => () => items.forEach(releasePreview), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const list = [...files].slice(0, LIMITS.mediaPerPost - items.length);
      if (files.length > list.length)
        toast.show(`You can add up to ${LIMITS.mediaPerPost} items`, 'info');
      const prepared: PickedMedia[] = [];
      for (const f of list) {
        try {
          prepared.push(await prepareFile(f, 'post'));
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Unsupported file', 'error');
        }
      }
      setItems((prev) => [...prev, ...prepared]);
    },
    [items.length, toast],
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target) releasePreview(target);
      return prev.filter((m) => m.id !== id);
    });
    const path = uploaded.current[id];
    if (path) {
      delete uploaded.current[id];
      void removeObjects(supabase, 'media', [path]).catch(() => undefined);
    }
  };

  const move = (index: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });

  const publish = async () => {
    if (!items.length || caption.length > LIMITS.caption) return;
    setError(null);
    setPhase('uploading');
    const controller = new AbortController();
    abort.current = controller;
    try {
      // Upload sequentially for predictable progress and memory use.
      for (const item of items) {
        if (uploaded.current[item.id]) continue;
        const path = newMediaPath(userId, item.mime);
        await uploadObject(supabase, supabaseConfig.url, supabaseConfig.anonKey, {
          bucket: 'media',
          path,
          body: item.body,
          contentType: item.mime,
          signal: controller.signal,
          onProgress: (f) => setProgress((p) => ({ ...p, [item.id]: f })),
        });
        uploaded.current[item.id] = path;
      }
      setPhase('saving');
      const postId = await createPost(supabase, {
        caption,
        kind,
        commentsEnabled,
        media: items.map((m) => ({
          storage_path: uploaded.current[m.id]!,
          media_type: m.mediaType,
          mime_type: m.mime,
          width: m.width,
          height: m.height,
          duration_ms: m.durationMs,
          alt_text: m.altText.trim() || null,
        })),
      });
      published.current = true;
      uploaded.current = {};
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.feed.all }),
        qc.invalidateQueries({ queryKey: ['profile'] }),
      ]);
      toast.show(kind === 'reel' ? 'Your reel is live' : 'Your post is live', 'success');
      navigate(`/p/${postId}`, { replace: true });
    } catch (e) {
      if (e instanceof UploadCancelledError) {
        setPhase('editing');
        toast.show('Upload cancelled', 'info');
        return;
      }
      setPhase('failed');
      setError(friendlyError(e, 'Publishing failed. Your media is kept — try again.'));
    } finally {
      abort.current = null;
    }
  };

  const busy = phase === 'uploading' || phase === 'saving';
  const totalProgress = items.length
    ? items.reduce((s, m) => s + (uploaded.current[m.id] ? 1 : (progress[m.id] ?? 0)), 0) /
      items.length
    : 0;

  return (
    <div className="mx-auto max-w-[980px] px-4 py-6 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Create</h1>
        {items.length > 0 && !busy && (
          <Button
            variant="ghost"
            onClick={() => setConfirmDiscard(true)}
            leftIcon={<X size={16} />}
          >
            Discard
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-6 py-24 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
          )}
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">
            <ImagePlus size={30} />
          </div>
          <h2 className="font-display text-2xl font-semibold">Share photos and videos</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Drag files here or choose from your device. Up to 10 items — JPEG, PNG, WebP, GIF, MP4,
            MOV or WebM.
          </p>
          <Button className="mt-6" size="lg" onClick={() => fileInput.current?.click()}>
            Select from device
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected media">
              {items.map((m, i) => (
                <li
                  key={m.id}
                  className="group relative overflow-hidden rounded-2xl bg-surface-muted"
                >
                  <div className="aspect-square">
                    {m.mediaType === 'video' ? (
                      <video
                        src={m.previewUrl}
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                        aria-label={`Video ${i + 1}`}
                      />
                    ) : (
                      <img
                        src={m.previewUrl}
                        alt={m.altText || `Selected image ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                      Cover
                    </span>
                  )}
                  {busy && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
                      <div
                        className="h-full bg-accent transition-[width]"
                        style={{
                          width: `${(uploaded.current[m.id] ? 1 : (progress[m.id] ?? 0)) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                  {!busy && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Move earlier"
                        onClick={() => move(i, -1)}
                        className="rounded-full bg-white/90 p-1 text-midnight"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move later"
                        onClick={() => move(i, 1)}
                        className="rounded-full bg-white/90 p-1 text-midnight"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => removeItem(m.id)}
                        className="rounded-full bg-white/90 p-1 text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {items.length < LIMITS.mediaPerPost && !busy && (
                <li>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-muted hover:border-accent hover:text-accent"
                  >
                    <ImagePlus size={22} />
                    <span className="text-xs font-semibold">Add more</span>
                  </button>
                </li>
              )}
            </ul>
            <details className="mt-5 rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Accessibility — alt text
              </summary>
              <p className="mt-1 text-xs text-muted">
                Describe each photo for people who use screen readers.
              </p>
              <div className="mt-3 space-y-3">
                {items.map((m, i) => (
                  <Input
                    key={m.id}
                    label={`Item ${i + 1}`}
                    value={m.altText}
                    maxLength={LIMITS.altText}
                    disabled={busy}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) => (x.id === m.id ? { ...x, altText: e.target.value } : x)),
                      )
                    }
                  />
                ))}
              </div>
            </details>
          </div>

          <div className="space-y-4">
            <Textarea
              label="Caption"
              placeholder="Write a caption… use #hashtags and @mentions"
              value={caption}
              max={LIMITS.caption}
              rows={6}
              disabled={busy}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="rounded-2xl border border-line bg-surface px-4">
              <Switch
                checked={commentsEnabled}
                onChange={setCommentsEnabled}
                disabled={busy}
                label="Allow comments"
              />
              {canReel && (
                <div className="border-t border-line">
                  <Switch
                    checked={asReel}
                    onChange={setAsReel}
                    disabled={busy}
                    label="Share as a reel"
                    description="Reels appear in the full-screen Reels feed."
                  />
                </div>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
              >
                {error}
              </div>
            )}

            {busy ? (
              <div
                className="space-y-3 rounded-2xl border border-line bg-surface p-4"
                aria-live="polite"
              >
                <div className="flex justify-between text-sm font-semibold">
                  <span>{phase === 'saving' ? 'Publishing…' : 'Uploading…'}</span>
                  <span className="tabular-nums">{Math.round(totalProgress * 100)}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={Math.round(totalProgress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${totalProgress * 100}%` }}
                  />
                </div>
                {phase === 'uploading' && (
                  <Button variant="outline" size="sm" onClick={() => abort.current?.abort()}>
                    Cancel upload
                  </Button>
                )}
              </div>
            ) : (
              <Button
                size="lg"
                fullWidth
                onClick={() => void publish()}
                disabled={caption.length > LIMITS.caption}
                leftIcon={
                  phase === 'failed' ? (
                    <RotateCw size={18} />
                  ) : kind === 'reel' ? (
                    <Clapperboard size={18} />
                  ) : undefined
                }
              >
                {phase === 'failed' ? 'Retry' : kind === 'reel' ? 'Share reel' : 'Share post'}
              </Button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this post?"
        description="Your selected media and caption will be removed."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          items.forEach((m) => removeItem(m.id));
          setCaption('');
          setPhase('editing');
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}

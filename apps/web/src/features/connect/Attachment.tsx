import {
  CircleNotchIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  PlayIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { formatDuration } from '@vybora/core';
import type { AttachmentRef } from '@vybora/e2ee';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useConnect } from './ConnectProvider';

const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

const watched = new WeakSet<QueryClient>();

/** Revoke a decrypted object URL only when its cache entry is dropped. */
function watchRevocations(qc: QueryClient) {
  if (watched.has(qc)) return;
  watched.add(qc);
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed' || event.query.queryKey[1] !== 'attachment') return;
    const url = event.query.state.data;
    if (typeof url === 'string') URL.revokeObjectURL(url);
  });
}

/**
 * Download → verify → decrypt an attachment into an in-memory object URL.
 * Plaintext never touches disk or the HTTP cache.
 */
function useDecrypted(ref: AttachmentRef, enabled = true) {
  const { engine } = useConnect();
  const qc = useQueryClient();
  useEffect(() => watchRevocations(qc), [qc]);
  return useQuery({
    queryKey: ['connect', 'attachment', ref.path],
    enabled: !!engine && enabled,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const bytes = await engine!.openAttachment(ref);
      return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: ref.mime }));
    },
  });
}

function Failed({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-warning" role="alert">
      <WarningCircleIcon size={14} aria-hidden="true" /> {label}
      <button type="button" className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function Loading() {
  return <CircleNotchIcon className="animate-spin opacity-70" size={20} aria-label="Decrypting" />;
}

function boxSize(a: AttachmentRef, max = 300) {
  const w = a.width ?? 4;
  const h = a.height ?? 3;
  const scale = Math.min(max / w, (max * 1.25) / h, 1) || 1;
  return {
    width: Math.max(140, Math.round(w * scale)),
    height: Math.max(100, Math.round(h * scale)),
  };
}

export function ImageAttachment({
  attachment,
  onOpen,
}: {
  attachment: AttachmentRef;
  onOpen?: (url: string) => void;
}) {
  const q = useDecrypted(attachment);
  const size = boxSize(attachment);
  if (q.isError) return <Failed label="Couldn’t decrypt photo" onRetry={() => void q.refetch()} />;
  return (
    <button
      type="button"
      onClick={() => q.data && onOpen?.(q.data)}
      className="block max-w-full overflow-hidden rounded-md bg-surface-strong"
      style={{ width: size.width, aspectRatio: `${size.width} / ${size.height}` }}
      aria-label="Open photo"
    >
      {q.data ? (
        <img src={q.data} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted">
          <Loading />
        </span>
      )}
    </button>
  );
}

export function VideoAttachment({ attachment }: { attachment: AttachmentRef }) {
  const [start, setStart] = useState(false);
  const q = useDecrypted(attachment, start);
  const size = boxSize(attachment);
  const box = { width: size.width, aspectRatio: `${size.width} / ${size.height}` };
  if (q.isError) return <Failed label="Couldn’t decrypt video" onRetry={() => void q.refetch()} />;
  if (!start || !q.data)
    return (
      <button
        type="button"
        onClick={() => setStart(true)}
        className="relative flex max-w-full items-center justify-center overflow-hidden rounded-md bg-black text-white"
        style={box}
        aria-label="Play video"
      >
        {start ? (
          <Loading />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40">
            <PlayIcon size={18} weight="fill" aria-hidden="true" />
          </span>
        )}
        {attachment.durationMs ? (
          <span className="absolute bottom-2 right-2 bg-black/70 px-1.5 font-mono text-[11px]">
            {formatDuration(attachment.durationMs)}
          </span>
        ) : null}
      </button>
    );
  return (
    <video
      src={q.data}
      controls
      autoPlay
      playsInline
      className="max-w-full rounded-md bg-black"
      style={box}
    />
  );
}

export function VoiceAttachment({ attachment }: { attachment: AttachmentRef }) {
  const q = useDecrypted(attachment);
  if (q.isError)
    return <Failed label="Couldn’t decrypt voice message" onRetry={() => void q.refetch()} />;
  return (
    <div className="flex min-w-[220px] items-center gap-2">
      {q.data ? (
        <audio
          src={q.data}
          controls
          preload="metadata"
          className="h-9 w-[240px] max-w-full"
          aria-label="Voice message"
        />
      ) : (
        <Loading />
      )}
    </div>
  );
}

export function FileAttachment({ attachment }: { attachment: AttachmentRef }) {
  const [want, setWant] = useState(false);
  const q = useDecrypted(attachment, want);
  useEffect(() => {
    if (!want || !q.data) return;
    const a = document.createElement('a');
    a.href = q.data;
    a.download = attachment.name ?? 'file';
    a.click();
    setWant(false);
  }, [want, q.data, attachment.name]);
  if (q.isError) return <Failed label="Couldn’t decrypt file" onRetry={() => void q.refetch()} />;
  return (
    <button
      type="button"
      onClick={() => setWant(true)}
      className="flex w-[260px] max-w-full items-center gap-3 rounded-md border border-current/20 px-3 py-2.5 text-left"
      aria-label={`Download ${attachment.name ?? 'file'}`}
    >
      <FileTextIcon size={22} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name ?? 'File'}</span>
        <span className="block font-mono text-[11px] opacity-75">
          {formatBytes(attachment.size)} · encrypted
        </span>
      </span>
      {want && !q.data ? <Loading /> : <DownloadSimpleIcon size={18} aria-hidden="true" />}
    </button>
  );
}

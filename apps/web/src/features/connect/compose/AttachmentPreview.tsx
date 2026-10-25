import { FileIcon, ImageIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { viewOnceFormat } from '@vybora/core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Field';
import { formatBytes } from '../Attachment';

const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');

/** The first bytes of a file, for sniffing its real type (never the whole file). */
async function readHead(file: File, bytes = 16): Promise<Uint8Array> {
  const head = file.slice(0, bytes);
  if (typeof head.arrayBuffer === 'function') return new Uint8Array(await head.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(head);
  });
}

/**
 * What's about to be sent, with the view-once choice. View once is offered only
 * for photos and videos, and only in formats the one-time viewer can show, so a
 * message can never arrive as media nobody can open.
 */
export function AttachmentPreview({
  files,
  onClose,
  onSend,
}: {
  /** Empty closes it. */
  files: readonly File[];
  onClose: () => void;
  onSend: (files: File[], viewOnce: boolean) => void;
}) {
  const [once, setOnce] = useState(false);
  // null while the file signatures are being read.
  const [canOnce, setCanOnce] = useState<boolean | null>(null);
  const media = files.length > 0 && files.every(isMedia);

  useEffect(() => {
    setOnce(false);
    if (!media) {
      setCanOnce(null);
      return;
    }
    let live = true;
    setCanOnce(null);
    void (async () => {
      // The signature, not the name or the browser's guess.
      const heads = await Promise.all(files.map((f) => readHead(f))).catch(() => null);
      if (live) setCanOnce(!!heads && heads.every((h) => viewOnceFormat(h) !== null));
    })();
    return () => {
      live = false;
    };
  }, [files, media]);

  const label = files.length === 1 ? 'Send 1 file' : `Send ${files.length} files`;
  return (
    <Dialog
      open={files.length > 0}
      onClose={onClose}
      title={files.length === 1 ? 'Send this file' : `Send ${files.length} files`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSend([...files], once)} data-autofocus>
            {label}
          </Button>
        </>
      }
    >
      <ul className="-mx-2 space-y-0.5" aria-label="Files to send">
        {files.map((f, i) => {
          const Icon = f.type.startsWith('image/')
            ? ImageIcon
            : f.type.startsWith('video/')
              ? VideoCameraIcon
              : FileIcon;
          return (
            <li key={`${f.name}-${i}`} className="flex min-h-12 items-center gap-3 px-2 py-1.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-muted"
                aria-hidden="true"
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{f.name}</span>
                <span className="block font-mono text-[11px] text-subtle">
                  {formatBytes(f.size)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {media && (
        <div className="mt-2 border-t border-line">
          <Switch
            checked={once}
            onChange={setOnce}
            label="View once"
            disabled={canOnce !== true}
            description={
              canOnce === false
                ? 'View once needs a JPEG, PNG, GIF, WebP, MP4 or WebM.'
                : once
                  ? 'Opens once on their device. Screenshots can’t be blocked.'
                  : 'Opens once, then it’s gone from their device.'
            }
          />
        </div>
      )}
    </Dialog>
  );
}

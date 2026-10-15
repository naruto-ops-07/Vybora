import { CopyIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';

/** Replaces the chat header while messages are being selected. */
export function SelectBar({
  count,
  canDelete,
  onCopy,
  onDelete,
  onCancel,
}: {
  count: number;
  canDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected messages"
      className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 md:px-4"
    >
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel selection">
        <XIcon size={20} />
      </Button>
      <span className="flex-1 text-[15px] font-semibold" aria-live="polite">
        {count} selected
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCopy}
        disabled={!count}
        aria-label="Copy selected"
      >
        <CopyIcon size={20} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete selected for everyone"
        className="text-danger"
      >
        <TrashIcon size={20} />
      </Button>
    </div>
  );
}

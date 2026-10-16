import { CopyIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';

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

/**
 * Confirms deleting the selected messages. `count` is captured by the caller when the
 * dialog opens, so the title doesn't change while the dialog closes.
 */
export function BulkDeleteDialog({
  open,
  count,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const one = count === 1;
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={one ? 'Delete 1 message for everyone?' : `Delete ${count} messages for everyone?`}
      description={
        one
          ? 'It is removed on every device in this chat.'
          : 'They are removed on every device in this chat.'
      }
      confirmLabel="Delete"
      danger
    />
  );
}

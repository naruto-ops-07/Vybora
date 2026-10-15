import { LIMITS } from '@vybora/validation';
import type { PostCard } from '@vybora/types';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Switch, Textarea } from '@/components/ui/Field';

export function EditPostDialog({
  open,
  onClose,
  post,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  post: PostCard;
  onSave: (patch: { caption: string; comments_enabled: boolean }) => void;
  saving: boolean;
}) {
  const [caption, setCaption] = useState(post.caption);
  const [comments, setComments] = useState(post.comments_enabled);
  useEffect(() => {
    if (open) {
      setCaption(post.caption);
      setComments(post.comments_enabled);
    }
  }, [open, post.caption, post.comments_enabled]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit post"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={caption.length > LIMITS.caption}
            onClick={() => onSave({ caption, comments_enabled: comments })}
          >
            Save
          </Button>
        </>
      }
    >
      <Textarea
        label="Caption"
        value={caption}
        max={LIMITS.caption}
        rows={5}
        onChange={(e) => setCaption(e.target.value)}
        data-autofocus
      />
      <Switch checked={comments} onChange={setComments} label="Allow comments" />
    </Dialog>
  );
}

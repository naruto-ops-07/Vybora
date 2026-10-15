import { reportContent } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { ReportReason, ReportTarget } from '@vybora/types';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Bullying or harassment' },
  { value: 'hate', label: 'Hate speech or symbols' },
  { value: 'violence', label: 'Violence or dangerous organizations' },
  { value: 'nudity', label: 'Nudity or sexual activity' },
  { value: 'self_harm', label: 'Suicide or self-injury' },
  { value: 'misinformation', label: 'False information' },
  { value: 'intellectual_property', label: 'Intellectual property violation' },
  { value: 'other', label: 'Something else' },
];

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
}) {
  const { userId } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason || !userId) return;
    setBusy(true);
    try {
      await reportContent(supabase, userId, {
        target_type: targetType,
        target_id: targetId,
        reason,
        details,
      });
      toast.show('Thanks — our team will review this report.', 'success');
      onClose();
      setReason(null);
      setDetails('');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report"
      description="Reports are confidential. The account you report won’t see who reported them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason} loading={busy} onClick={submit}>
            Submit report
          </Button>
        </>
      }
    >
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-semibold">Why are you reporting this?</legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted"
          >
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-[var(--vy-accent)]"
            />
            <span className="text-sm">{r.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3">
        <Textarea
          label="Additional details (optional)"
          value={details}
          max={1000}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

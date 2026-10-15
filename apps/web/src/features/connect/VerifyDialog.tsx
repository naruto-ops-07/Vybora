import { CheckCircleIcon, CopyIcon, ShieldCheckIcon, WarningIcon } from '@phosphor-icons/react';
import { qk, type SecureConversation } from '@vybora/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useConnect } from './ConnectProvider';
import { useNicknames } from './hooks';

/** Compare a 60-digit safety number out of band to rule out a man-in-the-middle. */
export function VerifyDialog({
  userId,
  conversation,
  onClose,
}: {
  userId: string;
  conversation: SecureConversation;
  onClose: () => void;
}) {
  const { engine } = useConnect();
  const qc = useQueryClient();
  const toast = useToast();
  const nicknames = useNicknames();
  const member = conversation.members.find((m) => m.id === userId);
  const name =
    nicknames.data?.[userId] ?? (member?.display_name || member?.username || 'this contact');
  const number = useQuery({
    queryKey: qk.connect.safety(userId),
    enabled: !!engine,
    queryFn: () => engine!.safetyNumberWith(userId),
  });
  const status = useQuery({
    queryKey: qk.connect.keys(userId),
    enabled: !!engine,
    queryFn: () => engine!.checkContactKeys(userId),
  });
  const verified = status.data?.verified;
  const changed = status.data?.status === 'changed';

  const trust = async (v: boolean) => {
    try {
      await engine!.trustContactKeys(userId, v);
      await qc.invalidateQueries({ queryKey: qk.connect.keys(userId) });
      toast.show(v ? `${name} is verified` : 'New safety number accepted', 'success');
      if (v) onClose();
    } catch {
      toast.show('Couldn’t save verification on this device. Try again.', 'error');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        verified
          ? `You verified ${name}`
          : changed
            ? `${name}’s safety number changed`
            : `Verify ${name}`
      }
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {verified ? (
            <CheckCircleIcon size={22} className="shrink-0 text-success" aria-hidden="true" />
          ) : changed ? (
            <WarningIcon size={22} className="shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <ShieldCheckIcon size={22} className="shrink-0 text-accent" aria-hidden="true" />
          )}
          <p className="text-sm leading-relaxed text-muted">
            Compare these numbers with {name} in person or on a call you trust. If they match, only
            your two accounts’ devices can read your messages.
          </p>
        </div>
        <div
          className="grid grid-cols-4 gap-x-2 gap-y-3 rounded-md border border-line bg-surface-muted p-4 font-mono"
          aria-label={`Safety number ${number.data ?? 'loading'}`}
        >
          {(number.data?.split(' ') ?? Array.from({ length: 12 }, () => '·····')).map((g, i) => (
            <span key={i} className="text-center text-base tracking-[0.12em] tabular-nums">
              {g}
            </span>
          ))}
        </div>
        {changed && !verified && (
          <p className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
            This usually means {name} added or reinstalled a device. If you didn’t expect it,
            confirm with them before sharing anything sensitive.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button disabled={verified || !number.data} onClick={() => void trust(true)}>
            {verified ? 'Verified' : 'Mark as verified'}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<CopyIcon size={15} />}
            disabled={!number.data}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(number.data ?? '')
                .then(() => toast.show('Safety number copied', 'success'))
            }
          >
            Copy safety number
          </Button>
          {changed && !verified && (
            <Button variant="ghost" onClick={() => void trust(false)}>
              Accept new number without verifying
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

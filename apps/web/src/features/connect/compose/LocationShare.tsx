import { MapPinIcon } from '@phosphor-icons/react';
import { formatCoordinates } from '@vybora/core';
import type { LocationPin } from '@vybora/e2ee';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';

type Fix = { lat: number; lng: number };

const REFUSED: Record<number, string> = {
  1: 'Your browser blocked location access. Allow it, then try again.',
  2: 'Your device couldn’t work out where it is. Try again in a moment.',
  3: 'That took too long. Try again.',
};

/**
 * Share where I am, once. Nothing is asked of the browser until "Share my
 * location" is pressed, and no map tiles are ever loaded: the bubble draws the
 * place itself. The location is not tracked afterwards.
 */
export function LocationShare({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (location: LocationPin) => void;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const supported = typeof navigator?.geolocation?.getCurrentPosition === 'function';

  useEffect(() => {
    if (open) return;
    setFix(null);
    setAsking(false);
    setProblem(null);
    setLabel('');
  }, [open]);

  const locate = () => {
    setAsking(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAsking(false);
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (e) => {
        setAsking(false);
        setProblem(REFUSED[e.code] ?? 'Couldn’t get your location. Try again.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share location"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {fix && (
            <Button
              onClick={() =>
                onSend({ lat: fix.lat, lng: fix.lng, ...(label.trim() && { label: label.trim() }) })
              }
            >
              Send location
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-3 text-sm leading-relaxed text-muted">
          <MapPinIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          Sends your current location once. It isn’t tracked.
        </p>
        {!supported ? (
          <p className="text-sm text-danger" role="alert">
            This browser can’t share a location.
          </p>
        ) : fix ? (
          <>
            <p className="rounded-md bg-surface-muted px-3 py-2.5 font-mono text-[13px]">
              {formatCoordinates(fix.lat, fix.lng)}
            </p>
            <Input
              label="Label (optional)"
              value={label}
              maxLength={200}
              placeholder="Home, the café on the corner…"
              onChange={(e) => setLabel(e.target.value)}
              hint="Only people in this chat can read it."
              data-autofocus
            />
          </>
        ) : (
          <>
            {problem && (
              <p role="alert" className="text-sm text-danger">
                {problem}
              </p>
            )}
            <Button onClick={locate} disabled={asking} data-autofocus>
              {asking ? <Spinner size={16} /> : null}
              {problem ? 'Try again' : 'Share my location'}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

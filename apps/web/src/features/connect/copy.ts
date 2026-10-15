import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

/** Copies text and confirms with a toast; resolves false when the browser refused. */
export function useCopyText() {
  const toast = useToast();
  return useCallback(
    async (text: string, done = 'Copied') => {
      try {
        if (!navigator.clipboard) throw new Error('no clipboard');
        await navigator.clipboard.writeText(text);
      } catch {
        toast.show('Couldn’t copy. Your browser blocked clipboard access.', 'error');
        return false;
      }
      toast.show(done, 'success');
      return true;
    },
    [toast],
  );
}

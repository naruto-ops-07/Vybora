import { useQuery } from '@tanstack/react-query';
import { signedDm, signedMedia } from '@/lib/supabase';

export function useSignedUrl(path: string | null | undefined, bucket: 'media' | 'dm' = 'media') {
  return useQuery({
    queryKey: ['signed', bucket, path],
    queryFn: () => (bucket === 'media' ? signedMedia(path!) : signedDm(path!)),
    enabled: !!path,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
  });
}

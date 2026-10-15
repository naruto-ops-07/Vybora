// Scheduled maintenance (call every 15–60 minutes from a cron job):
//  1) purge stories expired more than 1h ago (server clock, grace period)
//  2) drain private.media_deletion_queue → remove objects from Storage
//  3) remove orphaned uploads (objects older than 24h that no row references)
//
// Auth: requires the CRON_SECRET header — this function uses the service role.
import { adminClient, cors, env, json, safeEqual } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = req.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(secret, env('CRON_SECRET'))) return json({ error: 'forbidden' }, 403);

  const admin = adminClient();
  const report = {
    purgedStories: 0,
    purgedEnvelopes: 0,
    removedQueued: 0,
    removedOrphans: 0,
    errors: [] as string[],
  };

  // 1) expired stories (deletes rows; triggers enqueue their media)
  const { data: purged, error: purgeError } = await admin.rpc('purge_expired_stories', {
    p_grace: '1 hour',
  });
  if (purgeError) report.errors.push(`purge: ${purgeError.message}`);
  else report.purgedStories = purged ?? 0;

  // 1b) disappearing messages: delete expired ciphertext envelopes. Their
  //     attachment objects are queued for deletion by the table trigger.
  const { data: envelopes, error: envelopeError } = await admin.rpc('purge_expired_envelopes');
  if (envelopeError) report.errors.push(`envelopes: ${envelopeError.message}`);
  else report.purgedEnvelopes = envelopes ?? 0;

  // 2) drain the deletion queue in batches. Claimed rows are removed from the
  //    queue atomically; if a Storage delete fails, step 3 later catches the
  //    now-unreferenced object as an orphan.
  for (let round = 0; round < 20; round++) {
    const { data: batch, error } = await admin.rpc('claim_media_deletions', { p_limit: 100 });
    if (error) {
      report.errors.push(`queue: ${error.message}`);
      break;
    }
    const rows = (batch ?? []) as { bucket_id: string; object_path: string }[];
    if (!rows.length) break;
    const byBucket = new Map<string, string[]>();
    for (const row of rows)
      byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.object_path]);
    for (const [bucket, paths] of byBucket) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) report.errors.push(`remove ${bucket}: ${removeError.message}`);
    }
    report.removedQueued += rows.length;
  }

  // 3) orphans: uploads abandoned before a post/story/message row was created.
  const { data: orphans, error: orphanError } = await admin.rpc('find_orphan_media', {
    p_older_than: '24 hours',
    p_limit: 500,
  });
  if (orphanError) report.errors.push(`orphans: ${orphanError.message}`);
  else {
    const byBucket = new Map<string, string[]>();
    for (const o of (orphans ?? []) as { bucket_id: string; name: string }[])
      byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
    for (const [bucket, paths] of byBucket) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) report.errors.push(`orphan remove: ${error.message}`);
      else report.removedOrphans += paths.length;
    }
  }

  return json(report, report.errors.length ? 207 : 200);
});

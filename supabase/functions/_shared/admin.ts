// Shared helpers for trusted Edge Functions. The service-role key is only
// available here (server-side secret) and never shipped to clients.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the calling user from their JWT (never trust a user id in the body). */
export async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/** Constant-time comparison for shared secrets (cron / webhook callers). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** List every object under a folder prefix in a bucket (paginated). */
export async function listAll(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const walk = async (folder: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset });
      if (error) throw error;
      if (!data?.length) break;
      for (const item of data) {
        const path = folder ? `${folder}/${item.name}` : item.name;
        // Folders have no id in Storage listings.
        if (item.id) out.push(path);
        else await walk(path);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  };
  await walk(prefix);
  return out;
}

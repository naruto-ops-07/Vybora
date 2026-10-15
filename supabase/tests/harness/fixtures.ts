import { randomUUID } from 'node:crypto';
import type { TestDb } from './db';

type User = { id: string; username: string };

/** Upload an object to the media bucket and create a post through the real RPC. */
export async function createPost(
  db: TestDb,
  user: User,
  opts: { caption?: string; kind?: 'post' | 'reel'; commentsEnabled?: boolean; mime?: string } = {},
): Promise<string> {
  const mime = opts.mime ?? (opts.kind === 'reel' ? 'video/mp4' : 'image/jpeg');
  const path = `${user.id}/${randomUUID()}.${mime.split('/')[1]}`;
  await db.upload(user, 'media', path, mime);
  const [row] = await db.as<{ id: string }>(
    user,
    `select public.create_post($1, $2::jsonb, $3, $4) as id`,
    [
      opts.caption ?? '',
      JSON.stringify([
        {
          storage_path: path,
          media_type: mime.startsWith('video/') ? 'video' : 'image',
          mime_type: mime,
          width: 1080,
          height: 1350,
        },
      ]),
      opts.kind ?? 'post',
      opts.commentsEnabled ?? true,
    ],
  );
  return row!.id;
}

export async function follow(db: TestDb, follower: User, target: User) {
  await db.as(follower, `insert into follows (follower_id, following_id) values ($1, $2)`, [
    follower.id,
    target.id,
  ]);
}

export async function createStory(db: TestDb, user: User): Promise<{ id: string; path: string }> {
  const path = `${user.id}/${randomUUID()}.jpg`;
  await db.upload(user, 'media', path, 'image/jpeg');
  const [row] = await db.as<{ id: string }>(
    user,
    `insert into stories (author_id, storage_path, media_type, mime_type) values ($1, $2, 'image', 'image/jpeg') returning id`,
    [user.id, path],
  );
  return { id: row!.id, path };
}

export async function startConversation(db: TestDb, a: User, b: User): Promise<string> {
  const [row] = await db.as<{ id: string }>(
    a,
    `select public.start_direct_conversation($1) as id`,
    [b.id],
  );
  return row!.id;
}
